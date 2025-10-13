use qrcode::render::svg as qr_svg;
use qrcode::QrCode;
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
            width: 300,
            height: 300,
        }
    }
}

pub fn generate_sticker_svg(config: &StickerConfig) -> Result<String, anyhow::Error> {
    let community_id = Uuid::new_v4();
    let url = format!("{}/c/{}", config.base_url, community_id);

    let qr_code = QrCode::new(url.as_bytes())?;

    let qr_size = (config.height as f32 * 0.7) as u32;
    let qr_svg_content = qr_code
        .render::<qr_svg::Color>()
        .min_dimensions(qr_size, qr_size)
        .dark_color(qr_svg::Color("#000000"))
        .light_color(qr_svg::Color("#FFFFFF"))
        .build();

    let qr_x = (config.width - qr_size) / 2;
    let qr_y = (config.height as f32 * 0.05) as u32;
    let text_y = qr_y + qr_size + (config.height as f32 * 0.15) as u32;

    let qr_content_clean = qr_svg_content.replace("<?xml version=\"1.0\" standalone=\"yes\"?>", "");

    let svg = format!(
        "<?xml version=\"1.0\" standalone=\"yes\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{}\" height=\"{}\" viewBox=\"0 0 {} {}\">\n  <rect width=\"{}\" height=\"{}\" fill=\"#FFFFFF\"/>\n  <g transform=\"translate({}, {})\">\n{}\n  </g>\n  <text x=\"{}\" y=\"{}\" text-anchor=\"middle\" font-family=\"Arial, sans-serif\" font-size=\"32\" font-weight=\"bold\" fill=\"#000000\">PEEK</text>\n</svg>",
        config.width,
        config.height,
        config.width,
        config.height,
        config.width,
        config.height,
        qr_x,
        qr_y,
        qr_content_clean,
        config.width / 2,
        text_y
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
