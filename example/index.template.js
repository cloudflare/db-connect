import { DbConnect } from '@cloudflare/db-connect'
import { UAParser } from 'ua-parser-js'

addEventListener('fetch', event => {
  const colo = (event.request.cf || { colo: 'Unknown' }).colo
  const headers = event.request.headers
  const ray = headers.get('Cf-ray')
  const agent = new UAParser(headers.get('User-agent'))

  var device = agent.getDevice()
  if(!device.vendor) device.vendor = agent.getOS().name
  if(!device.model) device.model = agent.getBrowser().name

  event.respondWith(handleSql(ray, colo, `${device.vendor} ${device.model}`.trim()))
})

const db = $CODE

async function handleSql(ray, colo, device) {

  const insert = await db.submit({
    mode: 'exec',
    isolation: 'serializable',
    arguments: [ ray, colo, device ],
    cacheTtl: -1,
    statement: `
      CREATE TABLE IF NOT EXISTS quickstart
        (ray TEXT, colo TEXT, device TEXT);
      INSERT OR IGNORE INTO quickstart VALUES (?, ?, ?);`})

  if(!insert.ok) {
    return insert
  }

  const [queryC, queryD] = await Promise.all([
    db.submit({
      mode: 'query',
      cacheTtl: -1,
      statement: `
        SELECT colo, COUNT(*) AS views FROM quickstart
          GROUP BY colo ORDER BY views DESC;`}),
    db.submit({
      mode: 'query',
      cacheTtl: -1,
      statement: `
        SELECT device, COUNT(*) AS views FROM quickstart
          GROUP BY device ORDER BY views DESC;`})
  ])

  for(const query of [queryC, queryD]) {
    if(!query.ok) {
      return query
    }
  }

  const colos = (await queryC.json())
    .map(row => `\t${row.colo}: ${row.views}`)
    .join('\n')

  const devices = (await queryD.json())
    .map(row => `\t${row.device}: ${row.views}`)
    .join('\n')

  return new Response(`
  === Quickstart for db-connect ===
    Number of Views by Colo:\n${colos}
    Number of Views by Device:\n${devices}
  `)
}
