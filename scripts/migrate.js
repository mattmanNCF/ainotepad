#!/usr/bin/env node
// Standalone migration script for development use
// The app uses inline CREATE TABLE IF NOT EXISTS in db.ts for v1

console.log('AInotepad DB: Using inline migrations in db.ts (v1)')
console.log('No separate migration steps required for v1.')
console.log('DB file location: {userData}/ainotepad.db')
