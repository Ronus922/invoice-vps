export function parseExtractedJson(rawText: string): unknown {
  const cleaned = rawText.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const objectMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!objectMatch) {
      throw new Error('JSON object not found in AI response')
    }
    return JSON.parse(objectMatch[0])
  }
}
