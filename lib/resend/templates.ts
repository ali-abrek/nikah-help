import type { NotificationPayload } from '@/lib/notifications/types'

interface EmailTemplate {
  subject: string
  html: string
}

function baseLayout(content: string, link?: string): string {
  const linkHtml = link
    ? `<p style="margin-top: 24px;">
        <a href="https://nikahhelp.com${link}"
           style="display: inline-block; background: #FF8C42; color: white; padding: 12px 24px;
                  border-radius: 8px; text-decoration: none; font-weight: 600;">
          Open in NikahHelp
        </a>
       </p>`
    : ''

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                max-width: 480px; margin: 0 auto; padding: 24px; color: #333;">
      <div style="border-bottom: 2px solid #FF8C42; padding-bottom: 16px; margin-bottom: 24px;">
        <span style="font-size: 20px; font-weight: 700; color: #FF8C42;">NikahHelp</span>
      </div>

      ${content}

      ${linkHtml}

      <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
      <p style="font-size: 12px; color: #999;">
        You received this email because you have email notifications enabled.
        <a href="https://nikahhelp.com/settings" style="color: #FF8C42;">Manage preferences</a>
      </p>
    </div>
  `
}

function safePayload(payload: NotificationPayload['payload']): Record<string, unknown> {
  return (payload ?? {}) as Record<string, unknown>
}

export function likeReceivedTemplate(payload: NotificationPayload): EmailTemplate {
  const p = safePayload(payload.payload)
  const name = (p.actor_name as string) ?? 'Someone'

  return {
    subject: `${name} liked your profile`,
    html: baseLayout(
      `<h2 style="font-size: 18px; margin: 0 0 8px;">You received a like!</h2>
       <p style="font-size: 15px; line-height: 1.6; margin: 0;">
         <strong>${name}</strong> liked your profile. Check it out to see if you like them back.
       </p>`,
      `/profiles/${p.actor_id ?? ''}`,
    ),
  }
}

export function matchCreatedTemplate(payload: NotificationPayload): EmailTemplate {
  const p = safePayload(payload.payload)
  const name = (p.actor_name as string) ?? 'Someone'

  return {
    subject: `You matched with ${name}!`,
    html: baseLayout(
      `<h2 style="font-size: 18px; margin: 0 0 8px;">It's a Match!</h2>
       <p style="font-size: 15px; line-height: 1.6; margin: 0;">
         You and <strong>${name}</strong> liked each other. Start a conversation now!
       </p>`,
      p.link as string | undefined,
    ),
  }
}

export function messageNewTemplate(payload: NotificationPayload): EmailTemplate {
  const p = safePayload(payload.payload)
  const name = (p.actor_name as string) ?? 'Someone'

  return {
    subject: `New message from ${name}`,
    html: baseLayout(
      `<h2 style="font-size: 18px; margin: 0 0 8px;">New Message</h2>
       <p style="font-size: 15px; line-height: 1.6; margin: 0;">
         <strong>${name}</strong> sent you a message. Open the chat to reply.
       </p>`,
      p.link as string | undefined,
    ),
  }
}

export function accountBlockedTemplate(payload: NotificationPayload): EmailTemplate {
  const p = safePayload(payload.payload)
  const reason = (p.reason as string) ?? 'No reason provided'

  return {
    subject: 'Your account has been blocked',
    html: baseLayout(
      `<h2 style="font-size: 18px; margin: 0 0 8px;">Account Blocked</h2>
       <p style="font-size: 15px; line-height: 1.6; margin: 0;">
         Your account has been blocked for the following reason:
       </p>
       <p style="background: #fff3cd; border: 1px solid #ffc107; padding: 12px;
                 border-radius: 6px; font-size: 14px; margin: 12px 0;">
         ${reason}
       </p>`,
    ),
  }
}

export function accountReinstatedTemplate(payload: NotificationPayload): EmailTemplate {
  return {
    subject: 'Your account has been reinstated',
    html: baseLayout(
      `<h2 style="font-size: 18px; margin: 0 0 8px;">Account Reinstated</h2>
       <p style="font-size: 15px; line-height: 1.6; margin: 0;">
         Your account has been reinstated. You can now use NikahHelp again.
       </p>`,
      '/feed',
    ),
  }
}

export function inactivityWarningTemplate(_payload: NotificationPayload): EmailTemplate {
  return {
    subject: 'We miss you on NikahHelp!',
    html: baseLayout(
      `<h2 style="font-size: 18px; margin: 0 0 8px;">We Miss You!</h2>
       <p style="font-size: 15px; line-height: 1.6; margin: 0;">
         It's been a while since you last visited. New people are waiting to connect with you!
       </p>`,
      '/feed',
    ),
  }
}

export function getEmailTemplate(
  type: string,
  payload: NotificationPayload,
): EmailTemplate {
  switch (type) {
    case 'like_received':
      return likeReceivedTemplate(payload)
    case 'match_created':
      return matchCreatedTemplate(payload)
    case 'message_new':
      return messageNewTemplate(payload)
    case 'account_blocked':
      return accountBlockedTemplate(payload)
    case 'account_reinstated':
    case 'account_suspension_expired':
      return accountReinstatedTemplate(payload)
    case 'inactivity_warning':
      return inactivityWarningTemplate(payload)
    default:
      return {
        subject: `New notification: ${payload.title_key}`,
        html: baseLayout(
          `<h2>${payload.title_key}</h2><p>${payload.body_key}</p>`,
          payload.payload.link as string | undefined,
        ),
      }
  }
}
