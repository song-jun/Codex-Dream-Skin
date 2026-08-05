/**
 * 文件写入器
 * 负责将生成的代码写入文件系统
 */

import { promises as fsPromises, constants as fsConstants } from 'fs';
import { join } from 'path';
import { IGeneratedCode, IWriteResult } from './types';

/**
 * 确保目录存在，如果不存在则递归创建
 * @param dirPath 目录路径
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fsPromises.access(dirPath);
  } catch {
    // 目录不存在，递归创建
    await fsPromises.mkdir(dirPath, { recursive: true });
  }
}

/**
 * 检查文件是否存在
 * @param filePath 文件路径
 * @returns 是否存在
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * 写入生成的代码文件
 * @param outputDir 输出目录
 * @param code 生成的代码
 * @returns 写入结果
 */
export async function writeGeneratedFiles(
  outputDir: string,
  code: IGeneratedCode
): Promise<IWriteResult> {
  const files: string[] = [];
  
  try {
    // 确保输出目录存在
    await ensureDirectory(outputDir);
    
    // 写入 type.ts 文件
    const typeFilePath = join(outputDir, 'type.ts');
    await fsPromises.writeFile(typeFilePath, code.typeFile, 'utf-8');
    files.push(typeFilePath);
    
    // 写入 index.ts 文件
    const indexFilePath = join(outputDir, 'index.ts');
    await fsPromises.writeFile(indexFilePath, code.indexFile, 'utf-8');
    files.push(indexFilePath);
    
    return {
      success: true,
      files,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      files,
      error: errorMessage,
    };
  }
}
