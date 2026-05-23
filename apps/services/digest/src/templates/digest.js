"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderDigestEmail = renderDigestEmail;
// maps post type to a readable emoji label
function postTypeLabel(type) {
    const labels = {
        community: '💬 Community',
        emergency: '🚨 Emergency',
        classified: '🛒 Classified',
        lost_found: '🐾 Lost & Found',
        poll: '📊 Poll',
        event: '📅 Event',
        planning_notice: '🏛️ Planning Notice',
    };
    return labels[type] ?? type;
}
function renderDigestEmail(data) {
    const postsHtml = data.posts.length > 0
        ? data.posts.map(post => `
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0;">
            <div style="font-size: 11px; color: #888; margin-bottom: 4px;">
              ${postTypeLabel(post.type)} · ${post.upvotes} upvotes
            </div>
            <div style="font-size: 15px; color: #1a1a1a; font-weight: 500;">
              ${post.title}
            </div>
            <div style="font-size: 12px; color: #666; margin-top: 4px;">
              by ${post.authorDisplayName}
            </div>
          </td>
        </tr>
      `).join('')
        : `<tr><td style="padding: 12px 0; color: #888;">No posts this week.</td></tr>`;
    const residentsHtml = data.newResidents.length > 0
        ? `<p style="color: #444; font-size: 14px;">
        Welcome to your new neighbours: 
        <strong>${data.newResidents.map(r => r.displayName).join(', ')}</strong>
       </p>`
        : '';
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Weekly Neighbourhood Digest</title>
</head>
<body style="margin: 0; padding: 0; background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f5f5f5; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 8px; overflow: hidden; max-width: 600px; width: 100%;">

          <!-- Header -->
          <tr>
            <td style="background: #1a1a2e; padding: 32px; text-align: center;">
              <div style="font-size: 24px; font-weight: 700; color: #ffffff;">
                🏘️ Neighbr
              </div>
              <div style="font-size: 14px; color: #aaa; margin-top: 8px;">
                Weekly digest for ${data.communityName}
              </div>
              <div style="font-size: 12px; color: #666; margin-top: 4px;">
                Week of ${data.weekOf}
              </div>
            </td>
          </tr>

          <!-- Top Posts -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="font-size: 16px; font-weight: 600; color: #1a1a1a; margin: 0 0 16px 0;">
                Top posts this week
              </h2>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${postsHtml}
              </table>
            </td>
          </tr>

          <!-- New Residents -->
          ${data.newResidents.length > 0 ? `
          <tr>
            <td style="padding: 0 32px 32px;">
              <h2 style="font-size: 16px; font-weight: 600; color: #1a1a1a; margin: 0 0 12px 0;">
                New neighbours this week
              </h2>
              ${residentsHtml}
            </td>
          </tr>
          ` : ''}

          <!-- Footer -->
          <tr>
            <td style="background: #f9f9f9; padding: 24px 32px; border-top: 1px solid #eee;">
              <p style="font-size: 12px; color: #999; margin: 0; text-align: center;">
                You're receiving this because you're a verified resident of ${data.communityName}.<br>
                <a href="${data.unsubscribeUrl}" style="color: #999;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
