import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { CharacterData, UserCombo } from '../../shared/types';
import { api } from '../api';
import { RichText } from '../components/Content';
import { ComboRoute } from '../notation/Notation';
import { ComboBuilder } from './ComboBuilder';
import { ComboCopyContext } from './copyContext';


/** Вкладка «Комбо»: блок «Мои комбо» сверху + конструктор. Оборачивает остальные комбо, чтобы у них была кнопка «за основу». */
export function MyCombos({ data, charName, children }: { data: CharacterData; charName: string; children: ReactNode }) {
  const [list, setList] = useState<UserCombo[]>([]);
  const [editing, setEditing] = useState<Partial<UserCombo> | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.getUserCombos(data.id).then((l) => alive && setList(l));
    return () => {
      alive = false;
    };
  }, [data.id]);

  const persist = useCallback(
    async (next: UserCombo[]) => {
      setList(next);
      await api.saveUserCombos(data.id, next);
    },
    [data.id],
  );

  const stances = [...(data.frames?.stances ?? []), ...(data.guide?.stances ?? []).map((s) => s.abbr.replace(/\./g, ''))];
  const copy = useCallback((starters: string[], route: string) => setEditing({ starters, route }), []);

  return (
    <ComboCopyContext.Provider value={copy}>
      <section className="card card-wide my-combos">
        <header className="card-head">
          <h3>Мои комбо</h3>
          <button className="btn primary small" onClick={() => setEditing({})}>
            ＋ Новое комбо
          </button>
        </header>
        <div className="card-body">
          {list.length === 0 ? (
            <p className="muted small my-combos-empty">
              Тут будут твои комбо. Нажми «＋ Новое комбо» и собери его из иконок или найди приёмы поиском. Любое комбо из гайда ниже можно взять
              за основу — кнопка <b>✎</b> появляется при наведении.
            </p>
          ) : (
            list.map((c) => (
              <div key={c.id} className="my-combo">
                <div className="my-combo-head">
                  <b>{c.title || 'Без названия'}</b>
                  {c.tags?.map((t) => (
                    <span key={t} className="cb-tag on static">
                      {t}
                    </span>
                  ))}
                  <span className="my-combo-actions">
                    {confirmDel === c.id ? (
                      <>
                        <span className="small">Удалить?</span>
                        <button className="btn small danger" onClick={() => (void persist(list.filter((x) => x.id !== c.id)), setConfirmDel(null))}>
                          Да
                        </button>
                        <button className="btn small" onClick={() => setConfirmDel(null)}>
                          Нет
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="icon-btn small" title="Изменить" onClick={() => setEditing(c)}>
                          ✎
                        </button>
                        <button className="icon-btn small" title="Удалить" onClick={() => setConfirmDel(c.id)}>
                          🗑
                        </button>
                      </>
                    )}
                  </span>
                </div>
                <ComboRoute starters={c.starters} route={c.route} note={c.note ? <RichText text={c.note} /> : undefined} noCopy />
              </div>
            ))
          )}
        </div>
      </section>

      {children}

      {editing && (
        <ComboBuilder
          charName={charName}
          stances={stances}
          moves={data.frames?.moves ?? []}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(c) => {
            const exists = list.some((x) => x.id === c.id);
            void persist(exists ? list.map((x) => (x.id === c.id ? c : x)) : [c, ...list]);
            setEditing(null);
          }}
        />
      )}
    </ComboCopyContext.Provider>
  );
}
