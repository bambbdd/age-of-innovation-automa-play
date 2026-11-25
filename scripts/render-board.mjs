import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { boardSize, drawSmallBoard } from '../src/render/draw-small-board.mjs'

const { createCanvas, loadImage } = createRequire(import.meta.url)('@napi-rs/canvas')
const atlas = await loadImage(fileURLToPath(new URL('../public/boards/terrain-atlas.webp', import.meta.url)))
const canvas = createCanvas(boardSize.width, boardSize.height)
drawSmallBoard(canvas.getContext('2d'), atlas)
await writeFile(new URL('../public/boards/small-board.png', import.meta.url), await canvas.encode('png'))
