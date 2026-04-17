import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'

function harnessDir(): string {
  return app.getPath('userData')
}

function harnessPath(filename: string): string {
  return path.join(harnessDir(), filename)
}

const AGENT_MD_TEMPLATE = `# Notal Agent Context

## Purpose
You are the AI assistant for Notal, a personal knowledge and notes application. Your role is to:
- Organize and annotate captured notes with structure and insight
- Suggest connections between notes and wiki entries
- Surface patterns in the user's thinking over time

## Behavioral Guidelines
- Be concise in annotations — 1-2 sentences max
- Tag notes with kebab-case wiki topics that match existing KB entries when possible
- Surface non-obvious connections across topics
- Avoid redundancy with what the user already wrote

## Domain Knowledge
See MEMORY.md for accumulated knowledge about this user's note patterns.
See USER.md for this user's profile and preferences.

## Current KB Structure
[This section is auto-updated by the daily improvement cycle]
`

const USER_MD_TEMPLATE = `# User Profile

**Generated:** ${new Date().toISOString().slice(0, 10)}
**Last Updated:** ${new Date().toISOString().slice(0, 10)}

## Observed Preferences
[Populated by agents as they observe user behavior]

## Frequent Topics
[Auto-populated from note history]

## Correction Patterns
[What corrections the user makes to AI annotations — teaches future behavior]

## Workflow Notes
[How this user tends to capture and organize information]
`

const MEMORY_MD_TEMPLATE = `# Agent Memory

**Last Updated:** ${new Date().toISOString().slice(0, 10)}

## Note Patterns
[What kinds of notes this user typically captures]

## Tagging Conventions
[How tags have been applied historically — what each tag means for this user]

## Effective Annotations
[Examples of annotations the user found valuable — kept without editing]

## Ineffective Patterns
[Annotation styles or tag choices the user has corrected or rejected]
`

/**
 * Creates AGENT.md, USER.md, MEMORY.md in the user data directory if they don't exist.
 * Called once at app startup.
 */
export async function initHarnessFiles(): Promise<void> {
  const files: Array<{ name: string; template: string }> = [
    { name: 'AGENT.md', template: AGENT_MD_TEMPLATE },
    { name: 'USER.md', template: USER_MD_TEMPLATE },
    { name: 'MEMORY.md', template: MEMORY_MD_TEMPLATE },
  ]
  for (const { name, template } of files) {
    const filePath = harnessPath(name)
    try {
      await fs.access(filePath)
      // File exists — skip
    } catch {
      // File doesn't exist — create it
      await fs.writeFile(filePath, template, 'utf8')
      console.log(`[agentHarness] Created ${name}`)
    }
  }
}

/**
 * Returns concatenated content of AGENT.md, USER.md, MEMORY.md for injection
 * into AI prompts as system context.
 */
export async function readHarnessContext(): Promise<string> {
  const parts: string[] = []
  for (const name of ['AGENT.md', 'USER.md', 'MEMORY.md']) {
    try {
      const content = await fs.readFile(harnessPath(name), 'utf8')
      parts.push(`=== ${name} ===\n${content}`)
    } catch {
      // File missing — skip
    }
  }
  return parts.join('\n\n')
}

/**
 * Returns the raw content of all three harness files as an object.
 */
export async function readHarnessFiles(): Promise<{ agentMd: string; userMd: string; memoryMd: string }> {
  async function safeRead(name: string): Promise<string> {
    try {
      return await fs.readFile(harnessPath(name), 'utf8')
    } catch {
      return ''
    }
  }
  const [agentMd, userMd, memoryMd] = await Promise.all([
    safeRead('AGENT.md'),
    safeRead('USER.md'),
    safeRead('MEMORY.md'),
  ])
  return { agentMd, userMd, memoryMd }
}

/**
 * Writes updated content back to the harness files.
 */
export async function writeHarnessFiles(files: Partial<{ agentMd: string; userMd: string; memoryMd: string }>): Promise<void> {
  if (files.agentMd !== undefined) await fs.writeFile(harnessPath('AGENT.md'), files.agentMd, 'utf8')
  if (files.userMd !== undefined) await fs.writeFile(harnessPath('USER.md'), files.userMd, 'utf8')
  if (files.memoryMd !== undefined) await fs.writeFile(harnessPath('MEMORY.md'), files.memoryMd, 'utf8')
}

/**
 * Appends an observation to the USER.md Observed Preferences section.
 */
export async function updateUserProfile(observation: string): Promise<void> {
  try {
    let content = await fs.readFile(harnessPath('USER.md'), 'utf8')
    const marker = '## Observed Preferences'
    const idx = content.indexOf(marker)
    if (idx !== -1) {
      const insertAt = content.indexOf('\n', idx) + 1
      const entry = `- ${new Date().toISOString().slice(0, 10)}: ${observation}\n`
      content = content.slice(0, insertAt) + entry + content.slice(insertAt)
    } else {
      content += `\n- ${new Date().toISOString().slice(0, 10)}: ${observation}\n`
    }
    await fs.writeFile(harnessPath('USER.md'), content, 'utf8')
  } catch (err) {
    console.error('[agentHarness] updateUserProfile failed:', err)
  }
}

/**
 * Appends an entry to the relevant MEMORY.md section.
 * @param category - One of: 'Note Patterns', 'Tagging Conventions', 'Effective Annotations', 'Ineffective Patterns'
 */
export async function updateMemory(category: string, entry: string): Promise<void> {
  try {
    let content = await fs.readFile(harnessPath('MEMORY.md'), 'utf8')
    const marker = `## ${category}`
    const idx = content.indexOf(marker)
    if (idx !== -1) {
      const insertAt = content.indexOf('\n', idx) + 1
      const line = `- ${new Date().toISOString().slice(0, 10)}: ${entry}\n`
      content = content.slice(0, insertAt) + line + content.slice(insertAt)
    } else {
      content += `\n## ${category}\n- ${new Date().toISOString().slice(0, 10)}: ${entry}\n`
    }
    // Update the Last Updated date
    content = content.replace(
      /\*\*Last Updated:\*\* .+/,
      `**Last Updated:** ${new Date().toISOString().slice(0, 10)}`
    )
    await fs.writeFile(harnessPath('MEMORY.md'), content, 'utf8')
  } catch (err) {
    console.error('[agentHarness] updateMemory failed:', err)
  }
}

/**
 * Runs the daily improvement cycle: asks the AI model to review recent notes
 * and the current harness files, then writes improved versions back.
 *
 * @param llmFn - A function that sends a prompt to the AI and returns the response text
 */
export async function runDailyImprovement(llmFn: (prompt: string) => Promise<string>): Promise<void> {
  try {
    const { agentMd, userMd, memoryMd } = await readHarnessFiles()

    const prompt = `You are reviewing the self-learning harness for a personal notes AI assistant called Notal.

Below are the current harness files and a task to improve them.

=== AGENT.md (current) ===
${agentMd}

=== USER.md (current) ===
${userMd}

=== MEMORY.md (current) ===
${memoryMd}

Your task: Based on what you can infer about the user's patterns from these files, suggest improvements to each file.

Respond ONLY with a JSON object in this exact format (no markdown fences):
{
  "agentMd": "full updated AGENT.md content",
  "userMd": "full updated USER.md content",
  "memoryMd": "full updated MEMORY.md content"
}

Keep existing content, only add/improve. Do not delete any sections.`

    const response = await llmFn(prompt)

    // Parse the JSON response
    let parsed: { agentMd: string; userMd: string; memoryMd: string }
    try {
      parsed = JSON.parse(response.trim())
    } catch {
      // Try to extract JSON from response if wrapped in text
      const match = response.match(/\{[\s\S]*\}/)
      if (!match) {
        console.error('[agentHarness] runDailyImprovement: could not parse AI response as JSON')
        return
      }
      parsed = JSON.parse(match[0])
    }

    if (parsed.agentMd && parsed.userMd && parsed.memoryMd) {
      await writeHarnessFiles(parsed)
      console.log('[agentHarness] Daily improvement cycle complete — harness files updated')
    }
  } catch (err) {
    console.error('[agentHarness] runDailyImprovement failed:', err)
  }
}
