import Quill from 'quill'
import type { BlockEmbed } from 'quill/blots/block.js'

const Base = Quill.import('blots/block/embed') as typeof BlockEmbed

export class Horizontal extends Base {
  static blotName = 'horizontal'
  static tagName = 'HR'
}
