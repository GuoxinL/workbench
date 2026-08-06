// turndown-plugin-gfm 无官方类型声明，补一个最小 ambient 声明。
declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown'
  export const gfm: TurndownService.Plugin
  export const tables: TurndownService.Plugin
  export const strikethrough: TurndownService.Plugin
  export const taskListItems: TurndownService.Plugin
  export const highlightedCodeBlock: TurndownService.Plugin
}
