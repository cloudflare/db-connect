# Quickstart

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
npm i @cloudflare/db-connect
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
