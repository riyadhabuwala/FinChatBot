import express from 'express'
import { nanoid } from 'nanoid'
import {
  createSharedLink, getSharedLink, incrementViewCount,
  getConversationMessages, getAgentRunById, getLatestInsightScan,
  getOrCreateConversation,
} from '../services/supabase.js'
import { optionalAuth } from '../middleware/auth.js'

const router = express.Router()

// POST /api/share/create
// Creates a shareable link for a conversation, agent run, or insight scan
router.post('/create', optionalAuth, async (req, res, next) => {
  try {
    const { linkType, referenceId, title, expiresInDays } = req.body
    const userId = req.user?.id || 'demo'

    if (!['conversation', 'agent_run', 'insights'].includes(linkType)) {
      return res.status(400).json({ error: 'Invalid link type' })
    }

    const slug = nanoid(8)  // e.g. "xK9mP2aR"
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null

    const link = await createSharedLink({ slug, userId, linkType, referenceId, title, expiresAt })

    const shareUrl = `${process.env.FRONTEND_URL}/share/${slug}`
    res.json({ slug, shareUrl, expiresAt: link.expires_at })
  } catch (err) { next(err) }
})

// GET /api/share/:slug
// Returns the content for a shared link (public — no auth required)
router.get('/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params
    const link = await getSharedLink(slug)

    if (!link) return res.status(404).json({ error: 'Link not found' })
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This link has expired' })
    }

    // Increment view count
    await incrementViewCount(slug)

    // Fetch the referenced content
    let content = null
    if (link.link_type === 'conversation') {
      content = await getConversationMessages(link.reference_id, 100)
    } else if (link.link_type === 'agent_run') {
      content = await getAgentRunById(link.reference_id)
    } else if (link.link_type === 'insights') {
      content = await getLatestInsightScan(link.reference_id)
    }

    res.json({
      slug,
      linkType: link.link_type,
      title: link.title,
      viewCount: link.view_count + 1,
      createdAt: link.created_at,
      expiresAt: link.expires_at,
      content,
    })
  } catch (err) { next(err) }
})

export default router
