const { app } = require('electron')
app.whenReady().then(() => {
  const info = {
    electron: process.versions.electron,
    node: process.versions.node,
  }
  try {
    const { DatabaseSync } = require('node:sqlite')
    info.nodeSqlite = 'ok'
    const db = new DatabaseSync('C:/Users/李星历/.zcode/cli/db/db.sqlite', { readOnly: true })
    const row = db.prepare('SELECT COUNT(*) AS n FROM session').get()
    info.zcodeSessions = row.n
    db.close()
  } catch (e) {
    info.nodeSqlite = 'FAIL: ' + e.message
  }
  console.log('ELECTRON_CHECK ' + JSON.stringify(info))
  app.exit(0)
})
