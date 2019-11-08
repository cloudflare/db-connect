import { DbConnect } from '@cloudflare/db-connect'

addEventListener('fetch', event => {
  var cf = event.request.cf
  if(!cf) {
    console.warn('This quickstart works best when deployed to workers.dev or your own zone!')
    cf = {}
  }
  event.respondWith(handleSql(
    cf.colo || 'Unknown',
    cf.country || 'Unknown'))
})

const db = $CODE

async function handleSql(colo, country) {

  const ping = await db.ping()
  if(!ping.ok) {
    return ping
  }

  const table = await db.submit({
    statement: 'CREATE TABLE IF NOT EXISTS quickstart ' +
               '(colo TEXT, country TEXT, views INTEGER, ' +
               'PRIMARY KEY (colo, country))',
    mode: 'exec' })
  if(!table.ok) {
    return table
  }

  const insert = await db.submit({
    statement: 'INSERT OR IGNORE INTO quickstart VALUES (?, ?, ?)',
    mode: 'exec',
    arguments: [ colo, country, 0 ] })
  if(!insert.ok) {
    return insert
  }

  const update = await db.submit({
    statement: 'UPDATE quickstart SET views = views + 1 ' +
               'WHERE colo = ? AND country = ?',
    mode: 'exec',
    isolation: 'serializable',
    arguments: [ colo, country ] })
  if(!update.ok) {
    return update
  }

  const queryTotal = await db.submit({
    statement: 'SELECT SUM(views) AS views FROM quickstart' })
  if(!queryTotal.ok) {
    return queryTotal
  }

  const queryColo = await db.submit({
    statement: 'SELECT colo, SUM(views) AS views FROM quickstart GROUP BY colo' })
  if(!queryColo.ok) {
    return queryColo
  }

  return new Response(`Quickstart SQL Counter:
    Number of Unique Views: ${(await queryTotal.json())[0].views}
    Number of Unique Views by Colo:
    ${(await queryColo.json())
      .sort((a, b) => b.views - a.views)
      .map(c => `\t${c.colo}: ${c.views}\n`)} `)
}
