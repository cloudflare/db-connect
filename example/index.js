import { DbConnect } from '@cloudflare/db-connect'

addEventListener('fetch', event => {
  event.respondWith(handleIncrement())
})  

const db = new DbConnect({ host, clientId, clientSecret }) // REPLACE ME

async function handleIncrement() {
  const table = await db.submit({ statement: 'CREATE TABLE IF NOT EXISTS quickstart (i INT AUTOINCREMENT)', mode: 'exec' })
  if(!table.ok) {
    return table
  }
  const insert = await db.submit({ statement: 'INSERT INTO quickstart', mode: 'exec' })
  if(!insert.ok) {
    return insert
  }
  return db.submit({ statement: 'SELECT * FROM quickstart LIMIT ? ORDER BY i DESC', mode: 'query', arguments: [ 10 ] })
}
