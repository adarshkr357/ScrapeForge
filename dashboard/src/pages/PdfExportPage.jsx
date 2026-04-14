import { useState } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { FileDown, Play, Loader2, Download, FileType2 } from 'lucide-react';

export default function PdfExportPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [pdfSrc, setPdfSrc] = useState(null);
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [latency, setLatency] = useState(0);

  const handlePdfGeneration = async () => {
    if (!url) return toast.error('Enter a valid URL');

    setLoading(true);
    setPdfSrc(null);
    const start = Date.now();

    try {
      const body = { url };
      let res = await api.post('/pdf', body);
      
      // Async poll
      if (res.status === 'queued' || res.status === 'processing') {
        const pollUrl = res.poll_url;
        while (res.status === 'queued' || res.status === 'processing') {
          await new Promise(r => setTimeout(r, 2000));
          const p = await api.get(pollUrl.replace('/api/v1', ''));
          res = p.data ? p.data : p;
        }
      }

      if (res.success && res.data?.pdfBase64) {
        setPdfSrc(`data:application/pdf;base64,${res.data.pdfBase64}`);
        setCreditsUsed(res.creditsUsed || res.credits_used || 0);
        setLatency(Date.now() - start);
        toast.success(`PDF generated in ${Date.now() - start}ms`);
      } else {
        throw new Error(res.error || res.message || 'Failed to generate PDF');
      }

    } catch (err) {
      toast.error(err.message || 'PDF Generation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ padding: 8, background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>
            <FileDown size={24} color="#ef4444" />
          </div>
          PDF Export
        </h1>
        <p className="page-subtitle">Convert online articles, dashboards, and documents natively into high-quality PDFs.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: 24, alignItems: 'start' }}>
        {/* Left Column: Configuration */}
        <div className="sf-card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Website URL</h2>
          
          <div style={{ marginBottom: 24 }}>
            <input
              type="text"
              className="sf-input"
              placeholder="https://wikipedia.org"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div style={{ padding: 16, backgroundColor: 'var(--sf-bg-alt)', borderRadius: 8, marginBottom: 24 }}>
            <p style={{ fontSize: 13, color: 'var(--sf-text-secondary)', lineHeight: 1.6 }}>
              PDF generation utilizes headless Chromium instances to accurately capture print-media stylesheets. This operation uses <strong>5 credits</strong> per page.
            </p>
          </div>

          <button
            className="sf-button primary"
            style={{ width: '100%', WebkitUserSelect: 'none', background: '#ef4444', color: '#fff', border: 'none' }}
            onClick={handlePdfGeneration}
            disabled={loading}
          >
            {loading ? <Loader2 size={18} className="spin" /> : <Play size={18} />}
            {loading ? 'Generating Document...' : 'Generate PDF'}
          </button>
        </div>

        {/* Right Column: Output */}
        <div className="sf-card" style={{ padding: 0, minHeight: 600, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--sf-bg-alt)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--sf-border)', backgroundColor: 'var(--sf-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileType2 size={18} color="#ef4444" />
              Document Preview
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {latency > 0 && <span style={{ fontSize: 12, color: 'var(--sf-text-muted)' }}>{latency}ms</span>}
              {creditsUsed > 0 && (
                <span className="badge badge-warning" style={{ fontSize: 12 }}>
                  Used {creditsUsed} Credits
                </span>
              )}
              {pdfSrc && (
                <a href={pdfSrc} download={`export_${Date.now()}.pdf`} className="sf-button outline" style={{ padding: '4px 12px', fontSize: 12, borderColor: '#ef4444', color: '#ef4444' }}>
                  <Download size={14} /> Download PDF
                </a>
              )}
            </div>
          </div>
          
          <div style={{ flex: 1, padding: pdfSrc ? 0 : 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--sf-text-muted)' }}>
                <Loader2 size={32} className="spin" style={{ marginBottom: 16, color: '#ef4444' }} />
                <p>Rendering PDF via Playwright...</p>
              </div>
            ) : pdfSrc ? (
              <iframe 
                src={pdfSrc} 
                style={{ width: '100%', height: '100%', border: 'none', borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }} 
                title="PDF Preview"
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--sf-text-muted)' }}>
                <FileDown size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
                <p>Generated PDF will be displayed here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
