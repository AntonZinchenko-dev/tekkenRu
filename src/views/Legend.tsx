import { BtnIcon, DirIcon } from '../notation/Notation';
import { Notation } from '../notation/Notation';

/** Шпаргалка по самой нотации */
export function Legend() {
  return (
    <div className="legend">
      <section className="card card-wide">
        <header className="card-head">
          <h3>Как читать нотацию</h3>
        </header>
        <div className="card-body legend-grid">
          <div className="lg-item">
            <span className="lg-icons">
              <DirIcon d="f" /> <DirIcon d="b" /> <DirIcon d="u" /> <DirIcon d="d" />
            </span>
            <span>
              Направления: <b>f</b> вперёд, <b>b</b> назад, <b>u</b> вверх, <b>d</b> вниз. Диагонали: <b>df</b>, <b>db</b>, <b>uf</b>, <b>ub</b>. Считается, что персонаж смотрит вправо.
            </span>
          </div>
          <div className="lg-item">
            <span className="lg-icons">
              <DirIcon d="df" /> <DirIcon d="df" hold />
            </span>
            <span>
              Белая стрелка — <b>нажать</b>, тёмная — <b>зажать</b> (в тексте пишется заглавной: <code>f,F+4</code>).
            </span>
          </div>
          <div className="lg-item">
            <span className="lg-icons">
              <BtnIcon b={[1]} /> <BtnIcon b={[2]} /> <BtnIcon b={[3]} /> <BtnIcon b={[4]} />
            </span>
            <span>
              Кнопки — ромбик, как на геймпаде и в самой игре: <b>1</b> слева (□ / X), <b>2</b> сверху (△ / Y), <b>3</b> снизу (✕ / A), <b>4</b> справа (○ / B). 1 и 2 — руки, 3 и 4 — ноги. Светлый кружок — что жать.
            </span>
          </div>
          <div className="lg-item">
            <span className="lg-icons">
              <BtnIcon b={[1, 2]} /> <BtnIcon b={[3, 4]} /> <BtnIcon b={[2]} hold />
            </span>
            <span>
              Несколько светлых кружков — нажать одновременно (<code>1+2</code>, <code>3+4</code>). Жёлтое кольцо — держать кнопку (<code>2*</code>).
            </span>
          </div>
          <div className="lg-item">
            <Notation cmd="qcf1" plain />
            <span>
              <b>qcf</b> — четверть круга вперёд: вниз → вниз-вперёд → вперёд.
            </span>
          </div>
          <div className="lg-item">
            <Notation cmd="1,2,4" plain />
            <span>Запятая — нажимать по очереди (связка). Зелёная стрелка › — следующий шаг комбо, каждый шаг в своей плашке.</span>
          </div>
          <div className="lg-item">
            <Notation cmd="BT d+2" plain />
            <span>
              Синий значок с буквами — стойка или состояние: <b>BT</b> спиной, <b>FC</b> полный присед, <b>WS</b> при вставании, <b>SS</b> сайдстеп, <b>WR</b> с разбега, <b>H</b> в Heat. Наведи на значок — будет расшифровка.
            </span>
          </div>
          <div className="lg-item">
            <Notation cmd="CH f4 T!" plain />
            <span>
              <b>CH</b> — сработает как контр-хит. <b>T!</b> — торнадо, продлевает комбо. <b>W!</b> — стена.
            </span>
          </div>
          <div className="lg-item">
            <span className="lvl-demo">
              <span className="lvl lvl-h">h</span> <span className="lvl lvl-m">m</span> <span className="lvl lvl-l">l</span>
            </span>
            <span>Уровень удара: хай (можно пригнуться), мид (блок стоя), лоу (блок в присяде).</span>
          </div>
          <div className="lg-item">
            <span className="lvl-demo">
              <span className="mono safety-plus">+3</span> <span className="mono safety-safe">−8</span> <span className="mono safety-punish">−12</span>{' '}
              <span className="mono safety-launch">−15</span>
            </span>
            <span>Фреймы на блоке: зелёный — ты в плюсе, серый — безопасно, оранжевый — накажут, красный — накажут лаунчером.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
