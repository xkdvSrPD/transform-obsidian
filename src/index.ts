import { promises as fs } from 'fs'
import { join } from 'node:path';
import sharp from 'sharp';
import { ensureDir, parseName } from './utils/index.js';
import { readdir, stat } from 'fs/promises';

// Sharp 支持的图片格式
const SUPPORTED_FORMATS = ['jpg', 'jpeg', 'png', 'gif', 'tiff', 'avif']
const UNSUPPORTED_FORMATS = ['svg', 'bmp']

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
    // 转换 ![[图片名称]] 为 ![图片名称](/image/图片名称.webp)
    return content.replace(/!\[\[([^\]]+)\]\]/g, (match, imageName) => {
        // 提取纯文件名（去掉可能的路径）
        const originalFileName = imageName.split('/').pop() || imageName
        // 获取文件扩展名
        const fileExt = originalFileName.split('.').pop()?.toLowerCase() || ''
        // 去掉原始扩展名，使用parseName处理文件名
        const fileNameWithoutExt = originalFileName.replace(/\.[^.]+$/, '')
        const processedFileName = parseName(fileNameWithoutExt)
        
        // 如果是不支持的格式或已经是webp，保持原格式
        if (UNSUPPORTED_FORMATS.includes(fileExt) || fileExt === 'webp') {
            return `![${originalFileName}](/image/${processedFileName}.${fileExt})`
        }
        
        // 支持的格式转换为webp
        return `![${originalFileName}](/image/${processedFileName}.webp)`
    })
}



// 处理图片文件
async function processImages(imageFiles: string[], outputDir: string) {
    console.log(`[transform] Processing ${imageFiles.length} images...`)

    for (const filePath of imageFiles) {
        try {
            // 提取原始文件名
            const originalFileName = filePath.split(/[\\/]/).pop() || 'unknown'
            // 获取文件扩展名
            const fileExt = originalFileName.split('.').pop()?.toLowerCase() || ''
            // 去掉扩展名，使用parseName处理文件名
            const fileNameWithoutExt = originalFileName.replace(/\.[^.]+$/, '')
            const processedFileName = parseName(fileNameWithoutExt)
            
            // 如果是不支持的格式，直接复制原文件
            if (UNSUPPORTED_FORMATS.includes(fileExt)) {
                const outputPath = join(outputDir, `${processedFileName}.${fileExt}`)
                await fs.copyFile(filePath, outputPath)
                console.log(`[transform] Copied unsupported format: ${originalFileName} -> ${processedFileName}.${fileExt}`)
                continue
            }
            
            // 如果已经是webp格式，直接复制
            if (fileExt === 'webp') {
                const outputPath = join(outputDir, `${processedFileName}.webp`)
                await fs.copyFile(filePath, outputPath)
                console.log(`[transform] Copied WebP: ${originalFileName} -> ${processedFileName}.webp`)
                continue
            }
            
            // 支持的格式压缩为webp
            if (SUPPORTED_FORMATS.includes(fileExt)) {
                const outputPath = join(outputDir, `${processedFileName}.webp`)
                await sharp(filePath)
                    .webp({ quality: 80 }) // 设置webp质量为80%
                    .toFile(outputPath)
                console.log(`[transform] Compressed image: ${originalFileName} -> ${processedFileName}.webp`)
            } else {
                console.warn(`[transform] Unknown format: ${originalFileName}, skipping...`)
            }
        } catch (error) {
            console.error(`[transform] Failed to process image ${filePath}:`, error)
        }
    }

    console.log(`[transform] Images processed successfully`)
}
