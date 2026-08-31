import vietnam from "@svg-maps/vietnam";

import { groupByPlace, normalizePlace } from "../lib/memory-groups";
import type { MediaMemory } from "../lib/media";

export default function MemoryMap({ memories }: { memories: MediaMemory[] }) {
  const places = groupByPlace(memories);
  const counts = new Map(places.map((place) => [normalizePlace(place.region), place.memories.length]));
  const map = vietnam as { viewBox: string; locations: Array<{ id: string; name: string; path: string }> };

  return places.length ? (
    <section className="memory-map-view" aria-label="Bản đồ kỷ niệm">
      <div className="memory-map-card">
        <div className="memory-map-copy">
          <span>BẢN ĐỒ RIÊNG CỦA NHÀ MÌNH</span>
          <h2>Mỗi nơi đi qua,<br /><em>một điều để nhớ</em></h2>
          <p>Chỉ hiện thành phố hoặc tỉnh. Vị trí GPS chính xác luôn được giữ kín.</p>
        </div>
        <svg aria-label="Bản đồ Việt Nam đánh dấu những nơi gia đình có kỷ niệm" className="vietnam-memory-map" role="img" viewBox={map.viewBox}>
          {map.locations.map((location) => {
            const count = counts.get(normalizePlace(location.name)) ?? 0;
            return (
              <path className={count ? "has-memory" : undefined} d={location.path} data-count={count || undefined} key={location.id}>
                <title>{count ? `${location.name}: ${count} kỷ niệm` : location.name}</title>
              </path>
            );
          })}
        </svg>
      </div>
      <div className="memory-place-list">
        {places.map((place) => (
          <article className="memory-place-card" key={place.key}>
            <div>
              <span aria-hidden="true">⌖</span>
              <div><h2>{place.title}</h2><p>{place.region} · {place.subtitle}</p></div>
            </div>
            <div className="memory-place-strip">
              {place.memories.slice(0, 4).map((memory) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt={memory.title} height={160} key={memory.id} loading="lazy" src={`/api/media/${memory.id}`} width={160} />
              ))}
            </div>
          </article>
        ))}
      </div>
      <p className="map-attribution">Nền bản đồ tỉnh thành: <a href="https://github.com/VictorCazanave/svg-maps/tree/master/packages/vietnam" rel="noreferrer" target="_blank">SVG Maps · CC BY 4.0</a></p>
    </section>
  ) : (
    <section className="memory-map-empty" role="status">
      <span aria-hidden="true">⌖</span>
      <h2>Bản đồ đang chờ chuyến đi đầu tiên</h2>
      <p>Khi ảnh trong Immich có tên thành phố hoặc tỉnh, EmBe sẽ tự đặt kỷ niệm lên bản đồ.</p>
    </section>
  );
}
