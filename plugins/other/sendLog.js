import fs from "node:fs/promises"
import lodash from "lodash"
import moment from "moment"

export class sendLog extends plugin {
  constructor() {
    super({
      name: "发送日志",
      dsc: "发送最近100条运行日志",
      event: "message",
      priority: -Infinity,
      rule: [
        {
          reg: "^#(运行|错误)*日志[0-9]*(.*)",
          fnc: "sendLog",
          permission: "master",
        },
      ],
    })

    this.lineNum = 100
    this.maxNum = 10000

    this.logFile = `logs/command.${moment().format("YYYY-MM-DD")}.log`
    this.errFile = "logs/error.log"
  }

  async sendLog() {
    let lineNum = this.e.msg.match(/\d+/g)
    if (lineNum) {
      this.lineNum = Number(lineNum[0])
    }
    let keyword = this.e.msg.replace(/#|运行|错误|日志|\d/g, "").trim()
    if (keyword) {
      this.keyWord = keyword
    } else {
      this.keyWord = ""
    }

    let logFile = this.logFile
    let type = "运行"
    if (this.e.msg.includes("错误")) {
      logFile = this.errFile
      type = "错误"
    }

    if (this.keyWord) type = this.keyWord

    const log = await this.getLog(logFile)

    if (lodash.isEmpty(log)) return this.reply(`暂无相关日志：${type}`)

    let forwardNodes = [`最近${log.length}条${type}日志`]
    let currentChunk = ""
    const MAX_LEN = 5000

    for (let line of log) {
      while (line.length > MAX_LEN) {
        if (currentChunk) {
          forwardNodes.push(currentChunk.trimEnd())
          currentChunk = ""
        }
        forwardNodes.push(line.substring(0, MAX_LEN))
        line = line.substring(MAX_LEN)
      }

      if (currentChunk.length + line.length > MAX_LEN) {
        forwardNodes.push(currentChunk.trimEnd())
        currentChunk = line + "\n"
      } else {
        currentChunk += line + "\n"
      }
    }
    if (currentChunk) {
      forwardNodes.push(currentChunk.trimEnd())
    }

    const chunkGroups = lodash.chunk(forwardNodes, 2)
    for (let i = 0; i < chunkGroups.length; i++) {
      let nodes = chunkGroups[i]
      if (chunkGroups.length > 1) {
        nodes[0] = `[第 ${i + 1}/${chunkGroups.length} 部分]\n` + nodes[0]
      }
      let forwardMsg = await Bot.makeForwardArray(nodes)
      await this.reply(forwardMsg)

      if (i < chunkGroups.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }

  async getLog(logFile) {
    let log = []
    try {
      let content = await fs.readFile(logFile, "utf8")
      log = content.split("\n")
    } catch (e) {
      return []
    }

    if (this.keyWord) {
      log = log.filter(line => line.includes(this.keyWord))
    } else {
      log = lodash.slice(log, (Number(this.lineNum) + 1) * -1)
    }
    log = log.reverse()

    const tmp = []
    for (let i of log) {
      if (!i) continue
      if (this.keyWord && tmp.length >= this.maxNum) return tmp
      /* eslint-disable no-control-regex */
      i = i.replace(/\x1b[[0-9;]*m/g, "")
      i = i.replace(/\r|\n/g, "")
      tmp.push(i)
    }
    return tmp
  }
}
