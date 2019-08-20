# db-connect

Connect your SQL database to [Cloudflare Workers](https://workers.cloudflare.com/). Import this lightweight Javascript library to execute commands or cache queries from a database through an [Argo Tunnel](https://developers.cloudflare.com/argo-tunnel/quickstart/). Although designed for Workers, this library can be used in any environment that has access to the [Fetch](https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch#Syntax) and [SubtleCrypto](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest#Syntax) APIs.

# Example

```js
import { DbConnect } from '@cloudflare/db-connect'

const db = new DbConnect({
  host: 'sql.mysite.com',
  clientId: 'xxx',
  clientSecret: 'xxx'
})

async function findBirthday(name) {
  const resp = await db.submit({
    statement: 'SELECT * FROM users WHERE name = ? LIMIT 1',
    arguments: [ name ],
    cacheTtl: 60
  })

  if(!resp.ok) {
    return new Error('oops! could not find user.')
  }

  const users = await resp.json()
  // [ { "id": 1111,
  //   "name": "Matthew",
  //   "birthday": "2009-07-01" } ]

  return users[0].birthday
}

findBirthday('Matthew').then(bday => console.log(bday))
```

# Setup

## 1. [Access](https://developers.cloudflare.com/access/service-auth/service-token/)

Go to your Cloudflare dashboard under "Access" and generate a new service token.

![](https://developers.cloudflare.com/access/static/srv-generate.png)

Copy and save the `Client ID` and `Client Secret`, you will need this later to connect to the database.

![](https://developers.cloudflare.com/access/static/srv-secret.png)

Create an access policy for your specified `hostname` using the service token.

![](https://developers.cloudflare.com/access/static/srv-tokenname.png)

## 2. [Argo Tunnel](https://developers.cloudflare.com/argo-tunnel/quickstart/)

Install `cloudflared` on the server where your database is running. If you are using a managed database, you can install it on a nearby VM.

```bash
brew install cloudflare/cloudflare/cloudflared
```

Start the tunnel in `db-connect` mode, providing a hostname and your database connection URL.

```bash
cloudflared db-connect --hostname db.myzone.com --url postgres://user:pass@localhost?sslmode=disable --insecure
```

If you want to deploy using Docker or Kubernetes, see our guide [here](https://developers.cloudflare.com/argo-tunnel/reference/sidecar/). You can alternatively specify the following environment variables: `TUNNEL_HOSTNAME` and `TUNNEL_URL`.


## 3. Code

Import the `db-connect` library in your Cloudflare Workers or browser project.

```bash
npm install @cloudflare/db-connect
```

Now initalize the client and start coding!

```js
import { DbConnect } from '@cloudflare/db-connect'

const db = new DbConnect({
  host: 'db.myzone.com',
  clientId: 'xxx',
  clientSecret: 'xxx'
})

async function doPing() {
  const resp = await db.ping()
}
```

# Databases

`db-connect` supports the following database drivers out-of-the-box. If your database is not explicitly on the list it may still be supported. For instance, MariaDB uses the MySQL protocol and CockroachDB uses the PostgreSQL protocol.

* [PostgreSQL](https://github.com/lib/pq)
* [MySQL](https://github.com/go-sql-driver/mysql)
* [MSSQL](https://github.com/denisenkom/go-mssqldb)
* [Clickhouse](https://github.com/kshvakov/clickhouse)
* [SQLite3](https://github.com/mattn/go-sqlite3)

In the future, we may consider adding support for more databases such as Oracle, MongoDB, and Redis. If you want to contribute you can track the code in the [`cloudflared`](https://github.com/cloudflare/cloudflared/tree/master/dbconnect) repository.

# Documentation

## `new DbConnect(options)`

```js
import { DbConnect } from '@cloudflare/db-connect'

const db = new DbConnect({
  host,         // required, hostname of your Argo Tunnel running in db-connect mode.
  clientId,     // recommended, client id from your Access service token.
  clientSecret, // recommended, client secret from your Access service token.
})
```

## `Promise<Response> db.ping()`

```js
import { DbConnect } from '@cloudflare/db-connect'

const db = new DbConnect({...})

async function myPing() {
  const resp = await db.ping()
  if(resp.ok) {
    return true
  }
  throw new Error(await resp.text())
}
```

## `new Command(options)`

```js
import { Command } from '@cloudflare/db-connect'

const cmd = new Command({
  statement, // required, the database statement to submit.
  arguments, // optional, either an array or object of arguments.
  mode,      // optional, type of command as either 'query' or 'exec'.
  isolation, // optional, type of transaction isolation, defaults to 'default'.
  timeout,   // optional, number of seconds before a timeout, defaults to infinite.
  cacheTtl,  // optional, number of seconds to cache responses, defaults to -1.
  staleTtl,  // optional, after cacheTtl expires, number of seconds to serve stale, defaults to -1.
})
```

## `Promise<Response> db.submit(command)`

```js
import { DbConnect, Command } from '@cloudflare/db-connect'

const db = new DbConnect({...})

const cmd = new Command({
  statement: 'SELECT COUNT(*) AS n FROM books',
  cacheTtl: 60
})

async function mySubmit() {
  const resp = await db.submit(cmd)
  if(resp.ok) {
    return await resp.json() // [ { "n": 1234 } ]
  }
  throw new Error(await resp.text())
}
```

# Testing

If you want to test `db-connect` without a database you can use the following command to create an in-memory SQLite3 database:
```bash
cloudflared db-connect --playground
```

# Beta Access

We are looking for beta testers who want to create applications using `db-connect`, especially on Cloudflare Workers. If you have a use-case or an idea, [reach out](mailto:ashcon@cloudflare.com) to us and we'll consider giving you with special access!
