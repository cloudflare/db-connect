const fetch = require('node-fetch')
const { prompt } = require('enquirer')
const { validate } = require('email-validator')
const { bold, green } = require('ansi-colors')

const name = 'db-connect-quickstart'
const headers = {
  'User-Agent': 'db-connect/quickstart',
  'Content-Type': 'application/json'
}

async function entrypoint() {
  const user = await getUser()
  const zone = await getZone()
  var command = getCommand()
  var code = getCode('xxx-xxx-xxx-xxx.trycloudflare.com')
  if(zone) {
    const argo = await hasArgo(zone.id)
    if(argo) {
      const org = await getAccessOrganization(zone.account.id)
      if(org) {
        const app = await getAccessApplication(zone.id)
        const token = await getAccessToken(zone.account.id)
        const group = await getAccessGroup(zone.account.id, token.id)
        const policy = await getAccessPolicy(zone.id, app.id, group.id)
        command = getCommand(app.domain, org.auth_domain, app.aud)
        code = getCode(app.domain, token.client_id + '.' + zone.name, token.client_secret)
      }
    }
  }
  console.log(bold.whiteBright('\n1. Run the following command to start db-connect:\n'))
  console.log(green(command))
  console.log(bold.whiteBright('\n2. Put the following code in a Worker to submit queries:\n'))
  console.log(green(code))
  console.log()
  return ''
}

async function getUser() {
  headers['X-Auth-Email'] = await ask('Cloudflare email?', (_ => true), { validate })
  var user = null
  await ask('Cloudflare auth key?', async key => {
    headers['X-Auth-Key'] = key
    return fetchCf('/user').then(res => { user = res })
  }, { type: 'password' })
  return user
}

async function getZone(zoneId = null) {
  if(zoneId === 'try') {
    return null
  }
  if(zoneId) {
    return fetchCf(`/zones/${zoneId}`)
  }
  const zones = await fetchCf('/zones?status=active&page=1&per_page=21&direction=desc')
  if(zones.length < 1) {
    return null
  }
  if(zones.length > 20) {
    return ask('Cloudflare zone id?', getZone)
  }
  const zoneMap = new Map(zones.map(zone => [zone.name, zone.id]))
  zoneMap.set('trycloudflare.com', 'try')
  return askList('Cloudflare zone?', zoneMap).then(getZone)
}

async function hasArgo(zoneId = null) {
  if(!zoneId) {
    return false
  }
  const res = await fetchCf(`/zones/${zoneId}/argo/smart_routing`)
  if(res.editable) {
    if(res.value === 'on') {
      return true
    }
    const ok = await askOk('Argo Smart Routing is required, is it okay to enable?')
    if(ok) {
      return fetchCf(`/zones/${zoneId}/argo/smart_routing`, 'PATCH', { value: 'on' }).then(() => ok)
    }
  }
  return false
}

async function getAccessOrganization(accountId) {
  return fetchCf(`/accounts/${accountId}/access/organizations`)
    .catch(async err => {
      const ok = await askOk('Cloudflare Access is required, is it okay to enable?')
      if(!ok) return null
      return ask('Cloudflare access name?', name => {
        name = `${name}.cloudflareaccess.com`
        return fetchCf(`/accounts/${accountId}/access/organizations`, 'POST', { name, auth_domain: name })
      })
    })
}

async function getAccessApplication(zoneId, hostname = null) {
  if(hostname) {
    return fetchCf(`/zones/${zoneId}/access/apps`, 'POST', {
      name,
      domain: hostname,
      session_duration: '30m'
    }).catch(err => {
      if(err.message.includes('already_exists')) {
        return fetchCf(`/zones/${zoneId}/access/apps`)
          .then(apps => apps.filter(app => app.domain.includes(hostname))[0])
      }
      throw err
    })
  }
  return ask('Cloudflare hostname?', async hostname => {
    return getAccessApplication(zoneId, hostname)
  })
}

async function getAccessGroup(accountId, tokenId) {
  return fetchCf(`/accounts/${accountId}/access/groups`, 'POST', {
    name,
    include: [ { service_token: { token_id: tokenId } } ]
  }).catch(err => {
    if(err.message.includes('already_exists')) {
      return fetchCf(`/accounts/${accountId}/access/groups`)
        .then(groups => groups.filter(group => group.name === name)[0])
    }
    throw err
  })
}

async function getAccessPolicy(zoneId, accessId, groupId) {
  return fetchCf(`/zones/${zoneId}/access/apps/${accessId}/policies`, 'POST', {
    name,
    decision: 'non_identity',
    include: [ { group: { id: groupId } } ]
  })
}

async function getAccessToken(accountId) {
  return fetchCf(`/accounts/${accountId}/access/service_tokens`, 'POST', { name })
}

function getCommand(hostname, domain, aud) {
  var command = 'cloudflared db-connect --playground'
  if(hostname) {
    command = `${command} --hostname ${hostname} --auth-domain ${domain} --application-aud ${aud}`
  }
  return command
}

function getCode(hostname, clientId, clientSecret) {
  if(clientId && clientSecret) {
    return `new DbConnect({ host: '${hostname}', clientId: '${clientId}', clientSecret: '${clientSecret}' })`
  }
  return `new DbConnect({ host: '${hostname}' })`
}

async function ask(question, check = (_ => true), options = {}) {
  var value = null
  const res = await prompt(Object.assign({
    name: 'value',
    type: 'input',
    message: question,
    validate: async input => {
      try {
        value = await check(input)
        return true
      } catch(err) {
        return err.message
      }
    }
  }, options))
  return value || res['value']
}

async function askOk(question, check = (_ => true)) {
  return ask(question, check, { type: 'confirm' })
}

async function askList(question, items = new Map(), limit = 20) {
  const res = await ask(question, (_ => true), {
    type: 'autocomplete',
    choices: new Array(...items.keys()),
    limit,
    suggest: (input, choices) => {
      return choices.filter(choice => choice.message.includes(input))
    },
    validate: (_ => true)
  })
  return items.get(res)
}

async function fetchCf(path, method = 'GET', body = null) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  })
  const json = await res.json()
  if(res.ok) {
    return json.result
  }
  throw new Error(json.errors[0].message)
}

entrypoint()
  .then(console.log)
  .catch(console.error)
