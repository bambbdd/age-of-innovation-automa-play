import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.mjs':'text/javascript',
  '.json':'application/json', '.webp':'image/webp', '.png':'image/png' }
const port = Number(process.env.PORT ?? 4173)
const server = createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://localhost')
    const pathname = decodeURIComponent(url.pathname)
    const filename = pathname === '/' ? 'index.html' : pathname.slice(1)
    const parts = filename.split('/')
    const validPath = parts.every(part=>/^[a-z0-9._-]+$/i.test(part) && !part.startsWith('.'))
    const mime = types[path.extname(filename)]
    if (!validPath || !mime || !(filename === 'index.html' || ['src','public'].includes(parts[0]))) {
      res.writeHead(404).end()
      return
    }
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405,{Allow:'GET, HEAD'}).end(); return }
    const bytes = await readFile(path.join(root,...parts))
    res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-cache'})
    res.end(req.method === 'HEAD' ? undefined : bytes)
  } catch {
    res.writeHead(404).end()
  }
})
server.listen(port,'127.0.0.1',()=>console.log('혁신의 시대 · http://127.0.0.1:'+server.address().port))
