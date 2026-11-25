import { smallBoard, bridgeSites } from '../game/small-board.mjs'

export const boardSize = { width: 1680, height: 1250 }
const radius = 74
const pitch = Math.sqrt(3) * radius
const atlasOrder = ['forest', 'mountain', 'desert', 'plains', 'lake', 'wasteland', 'swamp', 'river']
const labels = ['숲', '산', '사막', '평원', '호수', '황무지', '늪', '강']
const font = '"Malgun Gothic", "Noto Sans KR", sans-serif'

export function hexCenter(hex) {
  return { x: 90 + pitch * (hex.column + (hex.row % 2) / 2), y: 146 + radius * 1.5 * hex.row }
}

function hexPath(ctx, x, y, size) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const angle = (i * 60 - 90) * Math.PI / 180
    const px = x + size * Math.cos(angle)
    const py = y + size * Math.sin(angle)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

function paintTerrain(ctx, atlas, index, x, y, width, height) {
  const side = atlas.width / 4
  ctx.drawImage(atlas, (index % 4) * side + 2, Math.floor(index / 4) * atlas.height / 2 + 2,
    side - 4, atlas.height / 2 - 4, x - width / 2, y - height / 2, width, height)
  if (atlasOrder[index] === 'river') {
    ctx.fillStyle = 'rgba(2, 8, 19, 0.86)'
    ctx.fillRect(x - width / 2, y - height / 2, width, height)
  }
}

// Sample a continuous water surface across touching hexes. Mirroring the
// large swatches keeps the current continuous at their shared boundaries.
function paintRiver(ctx, atlas, x, y) {
  const span = 280
  for (let row = Math.floor((y - radius) / span); row <= Math.floor((y + radius) / span); row++) {
    for (let col = Math.floor((x - pitch / 2) / span); col <= Math.floor((x + pitch / 2) / span); col++) {
      ctx.save()
      ctx.translate((col + 0.5) * span, (row + 0.5) * span)
      ctx.scale(col % 2 ? -1 : 1, row % 2 ? -1 : 1)
      paintTerrain(ctx, atlas, 7, 0, 0, span + 1, span + 1)
      ctx.restore()
    }
  }
}

// Draw two short wooden abutments with open water between their tips.
function drawBank(ctx, from, to) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  ctx.save()
  ctx.translate(from.x, from.y)
  ctx.rotate(angle)
  ctx.translate(radius * 0.88, 0)
  ctx.fillStyle = '#493628'
  ctx.fillRect(0, -7, 23, 14)
  ctx.fillStyle = '#f2c586'
  for (let step = 0; step < 3; step++) ctx.fillRect(3 + step * 6, -4, 5, 8)
  ctx.fillStyle = '#78563a'
  ctx.fillRect(0, -8, 5, 16)
  ctx.restore()
}

export function drawSmallBoard(ctx, atlas) {
  const { width, height } = boardSize
  ctx.fillStyle = '#ede7d7'
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = '#a69a7b'
  ctx.lineWidth = 1
  ctx.strokeRect(17, 17, width - 34, height - 34)
  ctx.fillStyle = '#303d37'
  ctx.font = 'bold 24px ' + font
  ctx.fillText('혁신의 시대  ·  1–3인 지도', 52, 60)

  const centers = new Map()
  for (const cell of smallBoard) {
    const { x, y } = hexCenter(cell)
    centers.set(cell.id, { x, y })
    ctx.save()
    hexPath(ctx, x, y, radius + 0.3)
    ctx.clip()
    if (cell.terrain === 'river') {
      paintRiver(ctx, atlas, x, y)
    } else {
      ctx.translate(x, y)
      ctx.scale((cell.column + cell.row) % 2 ? -1 : 1, 1)
      paintTerrain(ctx, atlas, atlasOrder.indexOf(cell.terrain), 0, 0, pitch + 2, radius * 2 + 2)
    }
    ctx.restore()
    hexPath(ctx, x, y, radius)
    ctx.strokeStyle = cell.terrain === 'river' ? '#41515d' : '#f4ecd5'
    ctx.lineWidth = cell.terrain === 'river' ? 1.3 : 2.5
    ctx.stroke()
  }
  for (const [a, b] of bridgeSites) {
    drawBank(ctx, centers.get(a), centers.get(b))
    drawBank(ctx, centers.get(b), centers.get(a))
  }

  const y = 1189
  ctx.strokeStyle = '#afa58e'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(50, 1143)
  ctx.lineTo(width - 50, 1143)
  ctx.stroke()
  ctx.font = '22px ' + font
  atlasOrder.forEach((terrain, index) => {
    const x = 80 + index * 166
    ctx.save()
    hexPath(ctx, x, y, 20)
    ctx.clip()
    paintTerrain(ctx, atlas, index, x, y, 42, 42)
    ctx.restore()
    ctx.fillStyle = '#303d37'
    ctx.fillText(labels[index], x + 32, y + 8)
  })
  paintTerrain(ctx, atlas, atlasOrder.indexOf('river'), 1432.5, y, 77, 28)
  const left = { x: 1395 - radius * 0.88, y }
  const right = { x: 1470 + radius * 0.88, y }
  drawBank(ctx, left, right)
  drawBank(ctx, right, left)
  ctx.fillStyle = '#303d37'
  ctx.fillText('다리터', 1485, y + 8)
}
