use qrcode::{types::Color, QrCode};
use uuid::Uuid;

pub struct StickerConfig {
    pub base_url: String,
    pub width: u32,
    pub height: u32,
}

impl Default for StickerConfig {
    fn default() -> Self {
        Self {
            base_url: "https://peek.verse.app".to_string(),
            width: 400,
            height: 480,
        }
    }
}

pub fn generate_sticker_svg(config: &StickerConfig) -> Result<String, anyhow::Error> {
    let community_id = Uuid::new_v4();
    let url = format!("{}/c/{}", config.base_url, community_id);

    let qr_code = QrCode::new(url.as_bytes())?;

    let matrix = qr_code.to_colors();
    let matrix_width = qr_code.width();

    let qr_display_size = (config.width as f32 * 0.65) as u32;

    let quiet_zone_modules = 4;
    let total_modules_with_quiet_zone = matrix_width + (quiet_zone_modules * 2);
    let module_size = qr_display_size as f32 / total_modules_with_quiet_zone as f32;
    let quiet_zone_offset = quiet_zone_modules as f32 * module_size;

    let text_height = 60;
    let total_content_height = qr_display_size + text_height;
    let qr_y = (config.height - total_content_height) / 2;
    let qr_x = (config.width - qr_display_size) / 2;

    let mut qr_modules = String::new();
    for y in 0..matrix_width {
        for x in 0..matrix_width {
            let idx = y * matrix_width + x;
            if matrix[idx] == Color::Dark {
                let px = quiet_zone_offset + (x as f32 * module_size);
                let py = quiet_zone_offset + (y as f32 * module_size);
                qr_modules.push_str(&format!(
                    "    <rect x=\"{:.2}\" y=\"{:.2}\" width=\"{:.2}\" height=\"{:.2}\" rx=\"1\" fill=\"url(#qrGradient)\"/>\n",
                    px, py, module_size, module_size
                ));
            }
        }
    }

    let border_radius = 24;
    let text_y = qr_y + qr_display_size + 50;

    let svg = format!(
        r##"<?xml version="1.0" standalone="yes"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#FAF5F0;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#FFFFFF;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="qrGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#FF6B4A;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#FF8C6B;stop-opacity:1" />
    </linearGradient>
    <filter id="shadow">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-opacity="0.1"/>
    </filter>
  </defs>

  <rect width="{width}" height="{height}" rx="{border_radius}" fill="url(#bgGradient)"/>
  <rect x="{qr_x}" y="{qr_y}" width="{qr_display_size}" height="{qr_display_size}"
        rx="12" fill="#FFFFFF" filter="url(#shadow)"/>

  <g transform="translate({qr_x}, {qr_y})">
{qr_modules}  </g>

  <text x="{center_x}" y="{text_y}" text-anchor="middle"
        font-family="system-ui, -apple-system, sans-serif"
        font-size="42" font-weight="700" fill="#2C3E50" letter-spacing="2">PEEK</text>

  <rect x="{line_x}" y="{line_y}" width="80" height="4" rx="2" fill="#4ECDC4"/>
</svg>"##,
        width = config.width,
        height = config.height,
        border_radius = border_radius,
        qr_x = qr_x,
        qr_y = qr_y,
        qr_display_size = qr_display_size,
        qr_modules = qr_modules,
        center_x = config.width / 2,
        text_y = text_y,
        line_x = (config.width - 80) / 2,
        line_y = text_y + 12,
    );

    Ok(svg)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_sticker() {
        let config = StickerConfig::default();
        let result = generate_sticker_svg(&config);
        assert!(result.is_ok());

        let svg = result.unwrap();
        assert!(svg.contains("svg"));
        assert!(svg.contains("PEEK"));
        assert!(svg.contains("/c/"));
    }
}
