/**
 * 浏览器版 chalk stub
 *
 * 原 chalk 库依赖 Node 的 process.stdout/stream，在浏览器/Electron 渲染进程里会报错。
 * 这里提供一个"无操作"实现：所有方法/属性都返回原字符串。
 * Vue UI 不依赖颜色输出，仅保证 console.log 不会因为 chalk 报错即可。
 */
const identity: any = (str: any) => (str === undefined || str === null ? '' : String(str));
identity.bold = identity;
identity.dim = identity;
identity.italic = identity;
identity.underline = identity;
identity.inverse = identity;
identity.strikethrough = identity;
identity.black = identity;
identity.red = identity;
identity.green = identity;
identity.yellow = identity;
identity.blue = identity;
identity.magenta = identity;
identity.cyan = identity;
identity.white = identity;
identity.gray = identity;
identity.grey = identity;
identity.blackBright = identity;
identity.redBright = identity;
identity.greenBright = identity;
identity.yellowBright = identity;
identity.blueBright = identity;
identity.magentaBright = identity;
identity.cyanBright = identity;
identity.whiteBright = identity;
identity.bgBlack = identity;
identity.bgRed = identity;
identity.bgGreen = identity;
identity.bgYellow = identity;
identity.bgBlue = identity;
identity.bgMagenta = identity;
identity.bgCyan = identity;
identity.bgWhite = identity;
// 兼容 chalk 默认导出是函数对象的情况
export default identity;
export const chalk = identity;
