import { LICENSES } from "../../lib/licenses";

const LicenseSection = () => (
  <section className="flex flex-col gap-2">
    <h3 className="text-base font-semibold">ライセンス</h3>
    <details className="text-sm">
      <summary className="cursor-pointer">使用 OSS 一覧を表示</summary>
      <ul className="mt-2 flex flex-col gap-1 pl-4">
        {LICENSES.map((l) => (
          <li key={l.name}>
            <span className="font-medium">{l.name}</span>:{" "}
            {l.url ? (
              <a href={l.url} target="_blank" rel="noreferrer" className="underline">
                {l.license}
              </a>
            ) : (
              l.license
            )}
          </li>
        ))}
      </ul>
    </details>
  </section>
);

export default LicenseSection;
