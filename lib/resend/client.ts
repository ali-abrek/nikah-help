let _resend: import('resend').Resend | null = null

function getResend(): import('resend').Resend {
  if (!_resend) {
    const { Resend } = require('resend') as typeof import('resend')
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

const FROM = process.env.RESEND_FROM_ADDRESS ?? 'NikahHelp <notifications@nikahhelp.com>'

export async function sendEmail(options: {
  to: string
  subject: string
  html: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const resend = getResend()
    const { error } = await resend.emails.send({
      from: FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
