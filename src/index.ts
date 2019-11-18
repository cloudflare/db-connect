/**
 * DbConnect, access your SQL database from Cloudflare Workers or the browser.
 * 
 * @example
 *  const db = new DbConnect('sql.mysite.com')
 * 
 *  db.ping()
 *  db.exec('CREATE TABLE firewall VALUES (ip INT)')
 *  db.query('INSERT INTO firewall VALUES (?), (?)', [1111, 1001])
 *  db.query('SELECT COUNT(*) FROM firewall', {cacheTtl: 60})
 * 
 *  async function do() {
 *    const resp = await db.query('SELECT * FROM firewall')
 *    if(resp.ok) {
 *      const rows = await resp.json()
 *      // [ { "ip": 1111 }, { "ip": 1001 } ]
 *    }
 *  }
 *
 * @author Ashcon Partovi
 * @copyright Cloudflare, Inc.
 */
export class DbConnect {
    private readonly httpClient: HttpClient

    /**
     * Creates a DbConnect instance with host and credentials.
     * 
     * @param host required, hostname or url of your Argo Tunnel running in db-connect mode.
     * @param clientId recommended, client id of the Access policy for your host.
     * @param clientSecret recommended, client secret of the Access policy for your host.
     */
    constructor(parameters: object) {
        const init = new DbConnectInit(parameters)

        const url = new URL(init.host)
        const headers = new Headers()
        if(init.clientId) {
            headers.set('Cf-access-client-id', init.clientId)
            headers.set('Cf-access-client-secret', init.clientSecret)
        }

        this.httpClient = new HttpClient(url, <RequestInit> {
            headers: headers,
            keepalive: true,
            cf: {
                cacheEverything: true
            }
        })
    }

    /**
     * Ping tests the connection to the database.
     * 
     * To reduce latency, pings will be served stale for up to 3 seconds.
     * 
     * @example
     *  const db = new DbConnect({...})
     *  
     *  async function doPing() {
     *    const resp = await db.ping()
     *    if(resp.ok) {
     *      return true
     *    }
     *    throw new Error(await resp.text())
     *  }
     */
    public async ping(): Promise<Response> {
        return this.httpClient.fetch('ping', {method: 'GET'}, 0, 3)
    }

    /**
     * Submit sends a Command to the database and fetches a Response.
     * 
     * @example
     *  const db = new DbConnect({...})
     *  
     *  async function doSubmit() {
     *    const cmd = new Command('SELECT * FROM users WHERE name = ? AND age > ?', ['matthew', 21])
     *    const resp = await db.submit(cmd)
     *    if(resp.ok) {
     *      return await resp.json()
     *    }
     *    throw new Error(await resp.text())
     *  }
     * 
     * @param command required, the command to submit.
     * @param cacheTtl optional, number of seconds to cache the response.
     * @param staleTtl optional, number of seconds to serve the response while stale.
     */
    public async submit(command: Command | object): Promise<Response> {
        if(!(command instanceof Command)) command = new Command(command)
        const cmd = <Command> command

        const init = {
            method: 'POST',
            body: JSON.stringify(cmd),
            headers: {'Content-type': 'application/json'}
        }

        return this.httpClient.fetch('submit', init, cmd.cacheTtl, cmd.staleTtl)
    }

}

/**
 * Initializer for DbConnect with host and credentials.
 * 
 * @see DbConnect
 */
class DbConnectInit {
    host:          string
    clientId?:     string
    clientSecret?: string

    constructor(parameters: object) {
        Object.assign(this, parameters)
        
        if(!this.host) throw new TypeError('host is a required argument')
        if(!this.host.startsWith('http')) this.host = `https://${this.host}`
        if(!this.clientId != !this.clientSecret) throw new TypeError('both clientId and clientSecret must be specified')
    }
}

/**
 * Command is a standard, non-vendor format for submitting database commands.
 */
export class Command {
    readonly statement: string
    readonly arguments: any
    readonly mode:      Mode
    readonly isolation: Isolation
    readonly timeout:   number
    readonly cacheTtl:  number
    readonly staleTtl:  number

    /**
     * Creates a new database Command.
     * 
     * @param statement required, statement of the command.
     * @param args an array or map of arguments, defaults to an empty array.
     * @param mode mode of the command, defaults to 'query'.
     * @param isolation isolation of the command, defaults to 'default'.
     * @param timeout timeout in seconds of the command, defaults to indefinite.
     * @param cacheTtl number of seconds to cache responses, defaults to -1.
     * @param staleTtl after cacheTtl expires, number of seconds to serve stale responses.
     */
    constructor(parameters: object) {
        const init = new CommandInit(parameters)

        Object.assign(this, init)
    }
}

/**
 * Initializer for Command with statement and options.
 * 
 * @see Command
 */
class CommandInit {
    statement:  string
    arguments?: any
    mode?:      Mode
    isolation?: Isolation
    timeout?:   number
    cacheTtl?:  number
    staleTtl?:  number

    constructor(parameters: object) {
        Object.assign(this, parameters)

        if(!this.statement) throw new TypeError('statement is a required argument')
        if(!this.arguments) this.arguments = []
        if(!this.mode) this.mode = Mode.query
        if(!this.timeout) this.timeout = 0
        if(!this.isolation) this.isolation = Isolation.none
        if(!this.cacheTtl) this.cacheTtl = -1
        if(!this.staleTtl) this.staleTtl = this.cacheTtl
    }
}

/**
 * Mode is a kind of Command.
 * * query, a request for a set of rows or objects.
 * * exec, an execution that returns a single result.
 * 
 * @link https://golang.org/pkg/database/sql/#DB.Exec
 */
export enum Mode {
    query = "query",
    exec  = "exec"
}

/**
 * Isolation is a transaction type when executing a Command.
 * 
 * @link https://golang.org/pkg/database/sql/#IsolationLevel
 */
export enum Isolation {
    none            = "none",
    default         = "default",
    readUncommitted = "read_uncommitted",
    readCommitted   = "read_committed",
    writeCommitted  = "write_committed",
    repeatableRead  = "repeatable_read",
    snapshot        = "snapshot",
    serializable    = "serializable",
    linearizable    = "linearizable"
}
  
/**
 * HttpClient is a convience wrapper for doing common transforms,
 * such as injecting authentication headers, to fetch requests.
 */
class HttpClient {
    private readonly url:   URL
    private readonly init:  RequestInit
    private readonly cache: Cache

    /**
     * Creates a new HttpClient.
     * 
     * @param url required, the base url of all requests.
     * @param init initializer for requests, defaults to empty. 
     * @param cache cache storage for requests, defaults to global.
     */
    constructor(url: URL, init?: RequestInit, cache?: Cache) {
        if(!url) throw new TypeError('url is a required argument')
        this.url = url

        this.init = init || {}
        if(!this.init.headers) this.init.headers = {}

        this.cache = cache || (<any> caches).default
    }

    /**
     * Fetch a path from the origin or cache.
     * 
     * @param path required, the path to fetch, joined by the client url.
     * @param init initializer for the request, recursively merges with client initializer.
     * @param cacheTtl required, number of seconds to cache the response.
     * @param staleTtl required, number of seconds to serve the response stale.
     */
    public async fetch(path: string, init?: RequestInit, cacheTtl?: number, staleTtl?: number): Promise<Response> {
        const key = await this.cacheKey(path, init)

        if(cacheTtl < 0 && staleTtl < 0) {
            return this.fetchOrigin(path, init)
        }

        var response = await this.cache.match(key, {ignoreMethod: true})
        if(!response) {
            response = await this.fetchOrigin(path, init)
            response.headers.set('Cache-control', this.cacheHeader(cacheTtl, staleTtl))

            await this.cache.put(key, response.clone())
        }

        return response
    }

    /**
     * Fetch a path directly from the origin.
     * 
     * @param path required, the path to fetch, joined by the client url.
     * @param init initializer for the request, recursively merges with client initializer.
     */
    private async fetchOrigin(path: string, init?: RequestInit): Promise<Response> {
        path = new URL(path, this.url).toString()
        init = this.initMerge(init)

        var response = await fetch(path, init)

        // FIXME: access sometimes redirects to a 200 login page when client credentials are invalid.
        if(response.redirected && new URL(response.url).hostname.endsWith('cloudflareaccess.com')) {
            return new Response('client credentials rejected by cloudflare access', response)
        }

        return new Response(response.body, response)
    }

    /**
     * Creates a new RequestInit for requests.
     * 
     * @param init the initializer to merge into the client initializer.
     */
    private initMerge(init?: RequestInit): RequestInit {
        init = Object.assign({headers: {}}, init || {})

        for(var kv of Object.entries(this.init.headers)) {
            init.headers[kv[0]] = [1]
        }

        return Object.assign(init, this.init)
    }

    /**
     * Creates a cache key for a Request.
     * 
     * @param path required, the resource path of the request.
     * @param init the initializer for the request, defaults to empty.
     */
    private async cacheKey(path: string, init?: RequestInit): Promise<Request> {
        path = new URL(path, this.url).toString()
        init = this.initMerge(init)

        if(init.method != 'POST') return new Request(path, init)
        
        const hash = await sha256(init.body)
        return new Request(`${path}/_/${hash}`, {method: 'GET', headers: init.headers})
    }

    /**
     * Creates a Cache-control header for a Response.
     * 
     * @param cacheTtl required, number of seconds to cache the response.
     * @param staleTtl required, number of seconds to serve the response stale.
     */
    private cacheHeader(cacheTtl?: number, staleTtl?: number): string {
        var cache = 'public'

        if(cacheTtl < 0 && staleTtl < 0) cache = 'private no-store no-cache'
        if(cacheTtl >= 0) cache += `, max-age=${cacheTtl}`
        if(staleTtl >= 0) cache += `, stale-while-revalidate=${staleTtl}`

        return cache
    }
}

/**
 * Generate a SHA-256 hash of any object.
 * 
 * @param object the object to generate a hash.
 */
async function sha256(object: any): Promise<string> {
    const buffer = new TextEncoder().encode(JSON.stringify(object))
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))

    return hashArray.map(b => ('00' + b.toString(16)).slice(-2)).join('')
}
