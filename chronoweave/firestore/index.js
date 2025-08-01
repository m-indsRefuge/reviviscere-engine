// chronoweave/firestore/index.js

import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

// Fix __dirname in ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load key relative to this file’s actual location
const keyPath = path.join(__dirname, 'serviceAccountKey.json')
const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'))

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  })
}

export const db = admin.firestore()
