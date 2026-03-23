const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..', 'src')
const bannedPatterns = [
  'VITE_ENABLE_SAMPLE_DATA',
  'USE_SAMPLE_DATA',
  'dummyimage.com',
  'i.pravatar.cc',
  'unsplash.com',
  'What\'s new',
  'What’s new',
  'Continue as demo',
  'SAMPLE_',
]

const offenders = []

const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(entryPath)
      continue
    }
    if (!/\.(ts|tsx|js|jsx|css|html)$/.test(entry.name)) continue
    const content = fs.readFileSync(entryPath, 'utf8')
    for (const pattern of bannedPatterns) {
      if (content.includes(pattern)) {
        offenders.push({
          file: path.relative(path.resolve(__dirname, '..'), entryPath),
          pattern,
        })
      }
    }
  }
}

walk(rootDir)

if (offenders.length) {
  console.error('Runtime mock/demo patterns detected in creator-side:')
  for (const offender of offenders) {
    console.error(`- ${offender.file}: ${offender.pattern}`)
  }
  process.exit(1)
}

console.log('No banned runtime mock/demo patterns found in creator-side/src.')
