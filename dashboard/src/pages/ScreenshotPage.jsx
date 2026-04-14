import { useState } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Camera, Play, Loader2, Image as ImageIcon, Download, Settings, ImageOff } from 'lucide-react';

export default function ScreenshotPage() {
  const [url, setUrl] = useState('');
  const [fullPage, setFullPage] = useState(true);
  const [format, setFormat] = useState('png'); // png, jpeg, webp
  const [quality, setQuality] = useState(90);
  const [selector, setSelector] = useState('');
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  
  const [loading, setLoading] = useState(false);
  const [imageSrc, setImageSrc] = useState(null);
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [latency, setLatency] = useState(0);

  const handleCapture = async () => {
    if (!url) return toast.error('Enter a valid URL');

    setLoading(true);
    setImageSrc(null);
    const start = Date.now();

    const body = {
      url,
      full_page: fullPage,
      format,
      viewport: { width: Math.max(320, width), height: Math.max(480, height) }
    };
    if (format === 'jpeg' || format === 'webp') body.quality = quality;
    if (selector) body.selector = selector;

    try {
      let res = await api.post('/screenshot', body);
      
      // Async Poll Logic (Screenshot runs in node-browser worker)
      if (res.status === 'queued' || res.status === 'processing') {
        const pollUrl = res.poll_url;
        while (res.status === 'queued' || res.status === 'processing') {
          await new Promise(r => setTimeout(r, 2000));
          const p = await api.get(pollUrl.replace('/api/v1', ''));
          res = p.data ? p.data : p;
        }
      }

      if (res.success && res.data?.screenshotBase64) {
        setImageSrc(`data:image/${format};base64,${res.data.screenshotBase64}`);
        setCreditsUsed(res.creditsUsed || res.credits_used || 0);
        setLatency(Date.now() - start);
        toast.success(`Screenshot captured in ${Date.now() - start}ms`);
      } else {
        throw new Error(res.error || res.message || 'Failed to capture screenshot');
      }

    } catch (err) {
      toast.error(err.message || 'Screenshot failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ padding: 8, background: 'rgba(236,72,153,0.1)', borderRadius: 8 }}>
            <Camera size={24} color="#ec4899" />
          </div>
          Page Screenshot
        </h1>
        <p className="page-subtitle">Render beautiful, full-page screenshots of any website utilizing headless browser workers.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: 24, alignItems: 'start' }}>
        {/* Left Column: Configuration */}
        <div className="sf-card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Target</h2>
          
          <div style={{ marginBottom: 20 }}>
            <input
              type="text"
              className="sf-input"
              placeholder="https://apple.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--sf-border)', margin: '20px 0' }} />

          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings size={16} />
            Capture Settings
          </h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--sf-text-secondary)', marginBottom: 6 }}>Format</label>
              <select className="sf-input" value={format} onChange={e => setFormat(e.target.value)}>
                <option value="png">PNG</option>
                <option value="jpeg">JPEG</option>
                <option value="webp">WEBP</option>
              </select>
            </div>
            {(format === 'jpeg' || format === 'webp') && (
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--sf-text-secondary)', marginBottom: 6 }}>Quality</label>
                <input type="number" className="sf-input" value={quality} onChange={e => setQuality(Number(e.target.value))} min={10} max={100} />
              </div>
            )}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 16 }}>
            <input 
              type="checkbox" 
              checked={fullPage}
              onChange={(e) => setFullPage(e.target.checked)}
              style={{ accentColor: 'var(--sf-primary)', width: 16, height: 16 }}
            />
            <span style={{ fontSize: 14 }}>Capture Full Page</span>
          </label>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--sf-text-secondary)', marginBottom: 6 }}>
              Target CSS Selector (Optional)
            </label>
            <input
              type="text"
              className="sf-input"
              placeholder=".main-content, #hero-banner"
              value={selector}
              onChange={(e) => setSelector(e.target.value)}
              disabled={fullPage}
              style={{ opacity: fullPage ? 0.5 : 1 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--sf-text-secondary)', marginBottom: 6 }}>Viewport Width</label>
              <input type="number" className="sf-input" value={width} onChange={e => setWidth(Number(e.target.value))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--sf-text-secondary)', marginBottom: 6 }}>Viewport Height</label>
              <input type="number" className="sf-input" value={height} onChange={e => setHeight(Number(e.target.value))} />
            </div>
          </div>

          <button
            className="sf-button primary"
            style={{ width: '100%', WebkitUserSelect: 'none', background: '#ec4899', color: '#fff', border: 'none' }}
            onClick={handleCapture}
            disabled={loading}
          >
            {loading ? <Loader2 size={18} className="spin" /> : <Play size={18} />}
            {loading ? 'Rendering...' : 'Capture Image'}
          </button>
        </div>

        {/* Right Column: Output */}
        <div className="sf-card" style={{ padding: 0, minHeight: 500, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--sf-bg-alt)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--sf-border)', backgroundColor: 'var(--sf-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ImageIcon size={18} color="#ec4899" />
              Preview Window
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {latency > 0 && <span style={{ fontSize: 12, color: 'var(--sf-text-muted)' }}>{latency}ms</span>}
              {creditsUsed > 0 && (
                <span className="badge badge-warning" style={{ fontSize: 12 }}>
                  Used {creditsUsed} Credits
                </span>
              )}
              {imageSrc && (
                <a href={imageSrc} download={`screenshot_${Date.now()}.${format}`} className="sf-button outline" style={{ padding: '4px 12px', fontSize: 12 }}>
                  <Download size={14} /> Download
                </a>
              )}
            </div>
          </div>
          
          <div style={{ flex: 1, padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--sf-text-muted)' }}>
                <Loader2 size={32} className="spin" style={{ marginBottom: 16, color: '#ec4899' }} />
                <p>Spinning up browser & capturing...</p>
              </div>
            ) : imageSrc ? (
              <div style={{ width: '100%', height: '100%', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--sf-bg)', borderRadius: 8, border: '1px dashed var(--sf-border)' }}>
                <img src={imageSrc} alt="Captured Screenshot" style={{ maxWidth: '100%', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--sf-text-muted)' }}>
                <ImageOff size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
                <p>Captured image will be previewed here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
