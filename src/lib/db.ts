import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

let prismaOptions: any = {
  log: ['query'],
}

// On Vercel, copy the SQLite database to the writable /tmp directory
if (process.env.VERCEL) {
  const tmpDbPath = '/tmp/custom.db'
  const projectDbPath = path.join(process.cwd(), 'db/custom.db')

  try {
    if (!fs.existsSync(tmpDbPath)) {
      const tmpDir = path.dirname(tmpDbPath)
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true })
      }
      fs.copyFileSync(projectDbPath, tmpDbPath)
      console.log('Successfully seeded database to /tmp')
    }
  } catch (err) {
    console.error('Failed to copy database to /tmp:', err)
  }

  prismaOptions.datasources = {
    db: {
      url: `file:${tmpDbPath}`,
    },
  }
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient(prismaOptions)

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db