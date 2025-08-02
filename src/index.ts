import { promises as fs } from 'fs'
import { join } from 'node:path';
import { Octokit } from 'octokit';
import { config } from 'dotenv';
import { ensureDir } from './utils/index.js';

// 加载环境变量
config();

// 读取环境变量
const githubToken = process.env.GITHUB_TOKEN;
const githubOwner = process.env.GITHUB_OWNER;
const githubRepo = process.env.GITHUB_REPO;
const githubRef = process.env.GITHUB_REF;

if (!githubToken) {
    throw new Error('GITHUB_TOKEN environment variable is required');
}
if (!githubOwner) {
    throw new Error('GITHUB_OWNER environment variable is required');
}
if (!githubRepo) {
    throw new Error('GITHUB_REPO environment variable is required');
}
if (!githubRef) {
    throw new Error('GITHUB_REF environment variable is required');
}

const octokit = new Octokit({ auth: githubToken });
const contentDir = join(process.cwd(), 'public', 'content')
const imageDir = join(process.cwd(), 'public', 'image')

// 确保目录存在
await ensureDir(contentDir)
await ensureDir(imageDir)

// 获取 GitHub 仓库文件树
const { data: tree } = await octokit.request(
    'GET /repos/{owner}/{repo}/git/trees/{ref}',
    {
        owner: githubOwner,
        repo: githubRepo,
        ref: githubRef,
        recursive: 'true'
    }
)

// 分离 markdown 文件和图片文件
const mdFiles = tree.tree.filter(
    (t: any) =>
        t.type === 'blob' &&
        t.path.startsWith('Blog/') &&
        t.path.endsWith('.md')
)

const imageFiles = tree.tree.filter(
    (t: any) =>
        t.type === 'blob' &&
        t.path.startsWith('Attachment/') &&
        /\.(png|jpg|jpeg|gif|bmp|svg|webp)$/i.test(t.path)
)

// 处理图片
if (imageFiles.length > 0) {
    await processImages(octokit, imageFiles, imageDir)
}

// 处理 Markdown 文件
if (mdFiles.length > 0) {
    await processMarkdownFiles(octokit, mdFiles, contentDir)
}

console.log(`[transform] Processing completed successfully`)
console.log(`[transform] Total markdown files processed: ${mdFiles.length}`)
console.log(`[transform] Total images processed: ${imageFiles.length}`)

// 下载markdown文件函数实现
async function processMarkdownFiles(octokit: any, mdFiles: any[], contentDir: string) {
    console.log(`[transform] Processing ${mdFiles.length} markdown files...`)
    
    for (const file of mdFiles) {
        try {
            const { data: rawContent } = await octokit.request(
                'GET /repos/{owner}/{repo}/contents/{path}',
                {
                    owner: githubOwner,
                    repo: githubRepo,
                    path: file.path,
                    mediaType: { format: 'raw' }
                }
            )

            if (rawContent) {
                const filename = file.path.split('/').pop()?.replace('.md', '') || file.sha
                
                // 转换 Obsidian 图片链接格式
                const processedContent = convertObsidianImages(rawContent as unknown as string)

                // 保存处理后的 markdown 文件
                const mdFilePath = join(contentDir, `${filename}.md`)
                await fs.writeFile(mdFilePath, processedContent, 'utf-8')
                console.log(`[transform] Downloaded and processed: ${filename}.md`)
            }
        } catch (error) {
            console.error(`[transform] Failed to download ${file.path}:`, error)
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

// 处理图片文件下载
async function processImages(
    octokit: any,
    imageFiles: any[],
    imageDir: string
) {
    console.log(`[transform] Processing ${imageFiles.length} images...`)

    // 下载所有图片
    for (const file of imageFiles) {
        try {
            const { data: imageContent } = await octokit.request(
                'GET /repos/{owner}/{repo}/contents/{path}',
                {
                    owner: githubOwner,
                    repo: githubRepo,
                    path: file.path
                }
            )

            let buffer = undefined
            // 提取原始文件名
            const originalFileName = file.path.split('/').pop()
            // 处理文件名中的空格
            const sanitizedFileName = sanitizeFileName(originalFileName)
            const imagePath = join(imageDir, sanitizedFileName)
            
            if (imageContent && imageContent.content && imageContent.encoding === 'base64') {
                // 方法1：base64 解码
                buffer = Buffer.from(imageContent.content, 'base64')
            } else if (imageContent && imageContent.download_url) {
                // 方法2：直接下载
                const response = await fetch(imageContent.download_url)
                const arrayBuffer = await response.arrayBuffer()
                buffer = Buffer.from(arrayBuffer)
            }

            if (buffer) {
                await fs.writeFile(imagePath, buffer)
                console.log(`[transform] Downloaded image: ${originalFileName} -> ${sanitizedFileName}`)
            }

        } catch (error) {
            console.error(`[transform] Failed to download image ${file.path}:`, error)
        }
    }

    console.log(`[transform] Images processed successfully`)
}
