import { useEffect } from 'react'

export default function DetailModal({ offer, onClose }) {
  // ESC-Taste schließt Modal
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Body-Scroll sperren solange Modal offen
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const hasContact = offer.contact?.name || offer.contact?.email || offer.contact?.phone

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-text">
            <p className="modal-org">{offer.org}</p>
            <h2 className="modal-title">{offer.name}</h2>
            {offer.address && (
              <p className="modal-location">{offer.address}</p>
            )}
          </div>
          {offer.avatar && (
            <img
              className="modal-avatar"
              src={offer.avatar}
              alt={offer.name}
              onError={(e) => { e.target.style.display = 'none' }}
            />
          )}
          <button className="modal-close" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>

        {/* Kategorien */}
        {(offer.categories?.length > 0 || offer.targets?.length > 0) && (
          <div className="modal-tags">
            {offer.categories?.map(c => (
              <span key={c} className="tag tag-category">{c}</span>
            ))}
            {offer.targets?.map(t => (
              <span key={t} className="tag tag-target">{t}</span>
            ))}
          </div>
        )}

        {/* Meta-Infos */}
        {(offer.timeframe || offer.barrierefreiheit) && (
          <div className="modal-meta-row">
            {offer.timeframe && (
              <span className="modal-meta-item">
                <span className="modal-meta-icon">🕐</span> {offer.timeframe}
              </span>
            )}
            {offer.barrierefreiheit && (
              <span className="modal-meta-item">
                <span className="modal-meta-icon">♿</span> {offer.barrierefreiheit}
              </span>
            )}
          </div>
        )}

        {/* Beschreibung */}
        {offer.description && (
          <div
            className="modal-description"
            dangerouslySetInnerHTML={{ __html: offer.description }}
          />
        )}

        {/* Anforderungen & Leistungen */}
        {offer.requirements && (
          <div className="modal-section">
            <h4>Anforderungen</h4>
            <p>{offer.requirements}</p>
          </div>
        )}
        {offer.benefits && (
          <div className="modal-section">
            <h4>Was du bekommst</h4>
            <p>{offer.benefits}</p>
          </div>
        )}

        {/* Kontakt */}
        {hasContact && (
          <div className="modal-contact">
            <h4>Kontakt</h4>
            {offer.contact.name && (
              <p className="contact-name">
                {offer.contact.name}
                {offer.contact.role && <span className="contact-role"> · {offer.contact.role}</span>}
              </p>
            )}
            {offer.contact.email && (
              <a className="contact-link" href={`mailto:${offer.contact.email}`}>
                ✉ {offer.contact.email}
              </a>
            )}
            {offer.contact.phone && (
              <a className="contact-link" href={`tel:${offer.contact.phone.replace(/\s/g, '')}`}>
                ☎ {offer.contact.phone}
              </a>
            )}
            {offer.homepage && (
              <a className="contact-link" href={offer.homepage} target="_blank" rel="noopener noreferrer">
                ↗ {offer.homepage}
              </a>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
