import { useCallback, useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useI18n } from '../../i18n';
import { WHATS_NEW, compareVersions } from '../../lib/whats-new';
import type { WhatsNewEntry } from '../../lib/whats-new';

const LAST_SEEN_KEY = 'scriptorium.whatsNew.lastSeenVersion';

// Affiche une seule fois les nouveautes apres une mise a jour.
// Premiere installation (aucun projet, aucune version memorisee) : rien n'est affiche.
// La version n'est memorisee qu'a la fermeture de la fenetre.
export function WhatsNew() {
  const { t, lang } = useI18n();
  const [entries, setEntries] = useState<WhatsNewEntry[]>([]);
  const [currentVersion, setCurrentVersion] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const current = String((await window.api.getAppVersion()) ?? '').trim();
        if (!current || cancelled) return;
        const lastSeen = window.localStorage.getItem(LAST_SEEN_KEY);
        let toShow: WhatsNewEntry[] = [];
        if (lastSeen) {
          toShow = WHATS_NEW.filter(
            (entry) => compareVersions(entry.version, lastSeen) > 0 && compareVersions(entry.version, current) <= 0
          );
        } else {
          const projects = await window.api.getProjects();
          const hasProjects = !!projects && Object.keys(projects).length > 0;
          if (hasProjects) toShow = WHATS_NEW.filter((entry) => entry.version === current);
        }
        if (cancelled) return;
        if (toShow.length === 0) {
          window.localStorage.setItem(LAST_SEEN_KEY, current);
          return;
        }
        setCurrentVersion(current);
        setEntries([...toShow].sort((a, b) => compareVersions(b.version, a.version)));
      } catch (error) {
        console.error('Quoi de neuf :', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const close = useCallback(() => {
    if (currentVersion) window.localStorage.setItem(LAST_SEEN_KEY, currentVersion);
    setEntries([]);
  }, [currentVersion]);

  if (entries.length === 0) return null;

  return (
    <Modal
      open
      title={t('whatsNewTitle')}
      width={520}
      maxHeight="80vh"
      onCancel={close}
      onPrimary={close}
      footer={<button onClick={close}>{t('close')}</button>}
    >
      <p className="whats-new-intro">{t('whatsNewIntro')}</p>
      {entries.map((entry) => (
        <section key={entry.version} className="whats-new-section">
          <h3 className="whats-new-version">Version {entry.version}</h3>
          <ul className="whats-new-list">
            {(lang === 'en' ? entry.en : entry.fr).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </Modal>
  );
}
