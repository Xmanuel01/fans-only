import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const sourceRoots = [
  path.join(root, 'user-side', 'src'),
  path.join(root, 'creator-side', 'src'),
]

const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.html'])
const bannedPatterns = [
  /dummyimage\.com/i,
  /i\.pravatar\.cc/i,
  /unsplash\.com/i,
  /VITE_ENABLE_SAMPLE_DATA/,
  /VITE_ENABLE_DEMO_MODE/,
  /USE_SAMPLE_DATA/,
  /Continue as demo/i,
  /\bdemoMode\b/,
]

const ignoredSegments = ['node_modules', 'dist', '__tests__', '__mocks__', 'test', 'tests']

const findings = []

const shouldIgnorePath = (filePath) => {
  const normalized = filePath.replace(/\\/g, '/')
  if (normalized.includes('.test.') || normalized.includes('.spec.')) return true
  return ignoredSegments.some((segment) => normalized.includes(`/${segment}/`))
}

const walk = (dir) => {
  if (!fs.existsSync(dir)) return
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (shouldIgnorePath(fullPath)) continue
    if (entry.isDirectory()) {
      walk(fullPath)
      continue
    }
    if (!allowedExtensions.has(path.extname(entry.name))) continue
    const content = fs.readFileSync(fullPath, 'utf8')
    for (const pattern of bannedPatterns) {
      if (!pattern.test(content)) continue
      findings.push({
        file: path.relative(root, fullPath),
        pattern: pattern.toString(),
      })
    }
  }
}

sourceRoots.forEach((sourceRoot) => walk(sourceRoot))

if (findings.length) {
  console.error('[no-mock-runtime] Banned runtime mock/demo patterns detected:')
  findings.forEach((finding) => {
    console.error(`- ${finding.file}: ${finding.pattern}`)
  })
  process.exit(1)
}

console.log('[no-mock-runtime] No banned runtime mock/demo patterns found.')
