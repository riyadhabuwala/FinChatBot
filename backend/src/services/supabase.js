import { createClient } from '@supabase/supabase-js'

// Service role client — bypasses RLS, used for all server-side operations
// NEVER send this key to the frontend
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
  }
)

// ─── USERS ──────────────────────────────────────────────

export async function createUser({ id, email, name, passwordHash }) {
  const { data, error } = await supabase
    .from('users')
    .insert({ id, email, name, password_hash: passwordHash })
    .select('id, email, name, created_at')
    .single()
  if (error) throw error
  return data
}

export async function findUserByEmail(email) {
  const { data } = await supabase
    .from('users')
    .select('id, email, name, password_hash')
    .eq('email', email)
    .single()
  return data   // null if not found
}

export async function findUserById(id) {
  const { data } = await supabase
    .from('users')
    .select('id, email, name')
    .eq('id', id)
    .single()
  return data
}

// ─── FILES ──────────────────────────────────────────────

export async function saveFileMetadata({ id, userId, originalName, storedPath, fileSize, mimeType, supabaseKey }) {
  const { data, error } = await supabase
    .from('uploaded_files')
    .insert({
      id,
      user_id: userId,
      original_name: originalName,
      stored_path: storedPath,
      file_size: fileSize,
      mime_type: mimeType,
      supabase_key: supabaseKey,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateFileRagStatus(fileId, { ragProcessed, chunkCount }) {
  await supabase
    .from('uploaded_files')
    .update({ rag_processed: ragProcessed, chunk_count: chunkCount })
    .eq('id', fileId)
}

export async function getUserFiles(userId) {
  const { data } = await supabase
    .from('uploaded_files')
    .select('id, original_name, file_size, mime_type, rag_processed, chunk_count, uploaded_at, supabase_key, stored_path')
    .eq('user_id', userId)
    .order('uploaded_at', { ascending: false })
  return data || []
}

export async function deleteFileRecord(fileId, userId) {
  const { data } = await supabase
    .from('uploaded_files')
    .delete()
    .eq('id', fileId)
    .eq('user_id', userId)
    .select()
    .single()
  return data
}

// ─── CONVERSATIONS & MESSAGES ────────────────────────────

export async function getOrCreateConversation(userId, mode) {
  // Try to find existing
  let { data } = await supabase
    .from('conversations')
    .select('id')
    .eq('user_id', userId)
    .eq('mode', mode)
    .single()

  if (!data) {
    const { data: created, error } = await supabase
      .from('conversations')
      .insert({ user_id: userId, mode })
      .select('id')
      .single()
    if (error) throw error
    data = created
  }
  return data.id
}

export async function saveMessage({ conversationId, role, content, citations = [], chartData = null }) {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      role,
      content,
      citations,
      chart_data: chartData,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getConversationMessages(conversationId, limit = 50) {
  const { data } = await supabase
    .from('messages')
    .select('id, role, content, citations, chart_data, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit)
  return data || []
}

export async function clearConversationMessages(userId, mode) {
  const convId = await getOrCreateConversation(userId, mode)
  await supabase.from('messages').delete().eq('conversation_id', convId)
}

export async function updateConversationTitle(conversationId, title) {
  await supabase
    .from('conversations')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
}

// ─── AGENT RUNS ─────────────────────────────────────────

export async function saveAgentRun({ userId, goal, tasks, analysisResults, finalReport, chartSpecs, confidence, approved, fileIds }) {
  const { data, error } = await supabase
    .from('agent_runs')
    .insert({
      user_id: userId,
      goal,
      tasks,
      analysis_results: analysisResults,
      final_report: finalReport,
      chart_specs: chartSpecs,
      confidence,
      approved,
      file_ids: fileIds,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function getUserAgentRuns(userId, limit = 10) {
  const { data } = await supabase
    .from('agent_runs')
    .select('id, goal, final_report, confidence, approved, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data || []
}

export async function getAgentRunById(runId) {
  const { data } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('id', runId)
    .single()
  return data
}

// ─── INSIGHT SCANS ───────────────────────────────────────

export async function saveInsightScan({ userId, insights, fileIds }) {
  const { data, error } = await supabase
    .from('insight_scans')
    .insert({ user_id: userId, insights, file_ids: fileIds })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function getLatestInsightScan(userId) {
  const { data } = await supabase
    .from('insight_scans')
    .select('*')
    .eq('user_id', userId)
    .order('scanned_at', { ascending: false })
    .limit(1)
    .single()
  return data
}

// ─── SHARED LINKS ────────────────────────────────────────

export async function createSharedLink({ slug, userId, linkType, referenceId, title, expiresAt }) {
  const { data, error } = await supabase
    .from('shared_links')
    .insert({ slug, user_id: userId, link_type: linkType, reference_id: referenceId, title, expires_at: expiresAt })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getSharedLink(slug) {
  const { data } = await supabase
    .from('shared_links')
    .select('*')
    .eq('slug', slug)
    .single()
  return data
}

export async function incrementViewCount(slug) {
  await supabase.rpc('increment_view_count', { link_slug: slug })
}

// ─── SUPABASE STORAGE ────────────────────────────────────

export async function uploadFileToStorage(fileBuffer, storagePath, mimeType) {
  const { data, error } = await supabase.storage
    .from('uploaded-files')
    .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: false })
  if (error) throw error
  return data.path
}

export async function downloadFileFromStorage(storagePath) {
  const { data, error } = await supabase.storage
    .from('uploaded-files')
    .download(storagePath)
  if (error) throw error
  return Buffer.from(await data.arrayBuffer())
}

export async function deleteFileFromStorage(storagePath) {
  await supabase.storage.from('uploaded-files').remove([storagePath])
}

export async function uploadIndexToStorage(indexBuffer, indexPath) {
  const { error } = await supabase.storage
    .from('faiss-indexes')
    .upload(indexPath, indexBuffer, { upsert: true })
  if (error) throw error
}

export async function downloadIndexFromStorage(indexPath) {
  const { data, error } = await supabase.storage
    .from('faiss-indexes')
    .download(indexPath)
  if (error) return null   // index doesn't exist yet
  return Buffer.from(await data.arrayBuffer())
}
