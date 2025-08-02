import { promises as fs } from 'fs'
import { join } from 'node:path';
import { ensureDir, parseName } from './utils/index.js';
import { readdir, stat } from 'fs/promises';

const contentDir = join(process.cwd(), 'obsidian')
const contentOutputDir = join(process.cwd(), 'output', 'content')
const imageOutputDir = join(process.cwd(), 'output', 'image')

// 清空输出目录
async function clearOutputDirs() {
    try {
        await fs.rm(contentOutputDir, { recursive: true, force: true })
        await fs.rm(imageOutputDir, { recursive: true, force: true })
        console.log('[transform] Output directories cleared')
    } catch (error) {
        console.log('[transform] Output directories already clean or not exist')
    }
}

// 递归获取指定目录下的所有文件
async function getFilesRecursively(dir: string, extensions: string[]): Promise<string[]> {
    const files: string[] = []
    
    try {
        const entries = await readdir(dir)
        
        for (const entry of entries) {
            const fullPath = join(dir, entry)
            const stats = await stat(fullPath)
            
            if (stats.isDirectory()) {
                const subFiles = await getFilesRecursively(fullPath, extensions)
                files.push(...subFiles)
            } else if (stats.isFile()) {
                const ext = fullPath.split('.').pop()?.toLowerCase()
                if (ext && extensions.includes(ext)) {
                    files.push(fullPath)
                }
            }
        }
    } catch (error) {
        console.error(`[transform] Error reading directory ${dir}:`, error)
    }
    
    return files
}

// 清空输出目录
await clearOutputDirs()

// 确保目录存在
await ensureDir(contentDir)
await ensureDir(contentOutputDir)
await ensureDir(imageOutputDir)

// 获取本地文件
const blogDir = join(contentDir, 'Blog')
const attachmentDir = join(contentDir, 'Attachment')

const mdFiles = await getFilesRecursively(blogDir, ['md'])
const imageFiles = await getFilesRecursively(attachmentDir, ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'])

// 处理图片
if (imageFiles.length > 0) {
    await processImages(imageFiles, imageOutputDir)
}

// 处理 Markdown 文件
if (mdFiles.length > 0) {
    await processMarkdownFiles(mdFiles, contentOutputDir)
}

console.log(`[transform] Processing completed successfully`)
console.log(`[transform] Total markdown files processed: ${mdFiles.length}`)
console.log(`[transform] Total images processed: ${imageFiles.length}`)

// 处理markdown文件函数实现
async function processMarkdownFiles(mdFiles: string[], outputDir: string) {
    console.log(`[transform] Processing ${mdFiles.length} markdown files...`)
    
    for (const filePath of mdFiles) {
        try {
            const rawContent = await fs.readFile(filePath, 'utf-8')
            const filename = filePath.split(/[\\/]/).pop()?.replace('.md', '') || 'unknown'
            
            // 转换 Obsidian 图片链接格式
            const processedContent = convertObsidianImages(rawContent)
            const transformFileName = parseName(filename)
            // 保存处理后的 markdown 文件
            const mdFilePath = join(outputDir, `${transformFileName}.md`)
            await fs.writeFile(mdFilePath, processedContent, 'utf-8')
            console.log(`[transform] Processed: ${transformFileName}.md`)
        } catch (error) {
            console.error(`[transform] Failed to process ${filePath}:`, error)
        }
    }

    console.log(`[transform] Markdown files processed successfully`)
}



// 转换 Obsidian 图片链接格式
function convertObsidianImages(content: string): string {
    // 转换 ![[图片名称]] 为 ![图片名称](/image/图片名称)
    return content.replace(/!\[\[([^\]]+)\]\]/g, (match, imageName) => {
        // 提取纯文件名（去掉可能的路径）
        const originalFileName = imageName.split('/').pop() || imageName
        // 处理文件名中的空格
        const sanitizedFileName = sanitizeFileName(originalFileName)
        return `![${originalFileName}](/image/${sanitizedFileName})`
    })
}

// 处理文件名中的空格和特殊字符
function sanitizeFileName(fileName: string): string {
    return fileName
        .replace(/\s+/g, '-')  // 将连续空格替换为单个连字符
        .replace(/-+/g, '-')   // 将连续连字符替换为单个连字符
        .replace(/^-|-$/g, '') // 移除开头和结尾的连字符
}

// 处理图片文件
async function processImages(imageFiles: string[], outputDir: string) {
    console.log(`[transform] Processing ${imageFiles.length} images...`)

    // 复制所有图片
    for (const filePath of imageFiles) {
        try {
            // 提取原始文件名
            const originalFileName = filePath.split(/[\\/]/).pop() || 'unknown'
            // 处理文件名中的空格
            const sanitizedFileName = sanitizeFileName(originalFileName)
            const imagePath = join(outputDir, sanitizedFileName)
            
            // 复制文件
            await fs.copyFile(filePath, imagePath)
            console.log(`[transform] Copied image: ${originalFileName} -> ${sanitizedFileName}`)
        } catch (error) {
            console.error(`[transform] Failed to copy image ${filePath}:`, error)
        }
    }

    console.log(`[transform] Images processed successfully`)
}
