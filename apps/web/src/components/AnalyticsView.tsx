import type { AnalyticsDto } from "@slp/shared";

const pct = (n: number | null) => (n === null ? "–" : `${n}%`);

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <dt className="text-sm text-slate-600 dark:text-slate-300">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

const th = "py-2 pr-4 text-left font-medium";
const td = "py-2 pr-4";

/**
 * Numbers first, as tables: they are what a screen reader and a keyboard user get, and what the charts are drawn from.
 * `charts` is slotted in by the page so this view can be tested without a chart library.
 */
export function AnalyticsView({ data, charts }: { data: AnalyticsDto; charts?: React.ReactNode }) {
  const { users, domains, modules, readiness, assessments, applications, opportunities } = data;
  const small = users.students < 10;
  return (
    <div className="space-y-10">
      {small && (
        <p
          role="note"
          className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          Only {users.students} student{users.students === 1 ? "" : "s"} so far, so averages and
          percentages swing widely with every new person. Read them as examples, not trends.
        </p>
      )}

      <section aria-label="Summary">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Students"
            value={users.students}
            note={`${users.newStudents} joined in the last ${data.windowDays} days`}
          />
          <Stat
            label={`Active in ${data.windowDays} days`}
            value={users.activeStudents}
            note={
              users.students
                ? `${Math.round((users.activeStudents / users.students) * 100)}% of students`
                : undefined
            }
          />
          <Stat
            label="With a readiness score"
            value={readiness.scored}
            note={
              readiness.fallbackScores
                ? `${readiness.fallbackScores} from the fallback formula, not the model`
                : "all from the model"
            }
          />
          <Stat
            label="Opportunities"
            value={`${opportunities.active} / ${opportunities.total}`}
            note="visible / total"
          />
        </dl>
      </section>

      {opportunities.missingVectors > 0 && (
        <p role="note" className="text-sm text-amber-800 dark:text-amber-300">
          {opportunities.missingVectors} opportunit
          {opportunities.missingVectors === 1 ? "y has" : "ies have"} no matching vector. Run the
          re-embed action or <code>npm run seed:opportunities</code> once the ML service is up.
        </p>
      )}

      {charts}

      <section aria-labelledby="dom-h">
        <h2 id="dom-h" className="text-lg font-semibold">
          Readiness by domain
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Each student counts once, with their latest score in that domain.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Readiness by domain</caption>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  Domain
                </th>
                <th scope="col" className={th}>
                  Students
                </th>
                <th scope="col" className={th}>
                  Scored
                </th>
                <th scope="col" className={th}>
                  Average
                </th>
                <th scope="col" className={th}>
                  Target
                </th>
                <th scope="col" className={th}>
                  At or above target
                </th>
              </tr>
            </thead>
            <tbody>
              {domains.map((d) => (
                <tr key={d.slug} className="border-t border-slate-200 dark:border-slate-800">
                  <th scope="row" className={`${td} text-left font-normal`}>
                    {d.name}
                  </th>
                  <td className={td}>{d.students}</td>
                  <td className={td}>{d.scored}</td>
                  <td className={td}>{d.avgReadiness ?? "–"}</td>
                  <td className={td}>{d.target}</td>
                  <td className={td}>
                    {d.scored
                      ? `${d.atOrAboveTarget} of ${d.scored} (${pct(d.pctAtOrAboveTarget)})`
                      : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="mod-h">
        <h2 id="mod-h" className="text-lg font-semibold">
          Module usage
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Module usage</caption>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  Module
                </th>
                <th scope="col" className={th}>
                  Students ever
                </th>
                <th scope="col" className={th}>
                  Records ever
                </th>
                <th scope="col" className={th}>
                  Students, last {data.windowDays} days
                </th>
                <th scope="col" className={th}>
                  Records, last {data.windowDays} days
                </th>
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => (
                <tr key={m.key} className="border-t border-slate-200 dark:border-slate-800">
                  <th scope="row" className={`${td} text-left font-normal`}>
                    {m.label}
                  </th>
                  <td className={td}>{m.users}</td>
                  <td className={td}>{m.total}</td>
                  <td className={td}>{m.recentUsers}</td>
                  <td className={td}>{m.recent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="app-h">
        <h2 id="app-h" className="text-lg font-semibold">
          Applications ({applications.total})
        </h2>
        <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {Object.entries(applications.byStatus).map(([s, n]) => (
            <li key={s}>
              <span className="capitalize">{s}</span>: {n}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ass-h">
        <h2 id="ass-h" className="text-lg font-semibold">
          Most attempted assessments
        </h2>
        {assessments.length === 0 ? (
          <p className="mt-2 text-sm">No submitted attempts yet.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <caption className="sr-only">Most attempted assessments</caption>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  Assessment
                </th>
                <th scope="col" className={th}>
                  Domain
                </th>
                <th scope="col" className={th}>
                  Attempts
                </th>
                <th scope="col" className={th}>
                  Average score
                </th>
              </tr>
            </thead>
            <tbody>
              {assessments.map((a) => (
                <tr key={a.id} className="border-t border-slate-200 dark:border-slate-800">
                  <th scope="row" className={`${td} text-left font-normal`}>
                    {a.title}
                  </th>
                  <td className={td}>{a.domain}</td>
                  <td className={td}>{a.attempts}</td>
                  <td className={td}>{a.avgScore}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
