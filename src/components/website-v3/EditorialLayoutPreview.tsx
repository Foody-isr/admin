/** Small diagrams for the text-and-image layouts, shared by insertion and editing. */
export function EditorialLayoutPreview({ layout }: { layout: string }) {
  const image = (x: number, y: number, width: number, height: number) => (
    <rect x={x} y={y} width={width} height={height} rx="2" fill="#e8eaec" />
  );
  const text = (x: number, y: number, width = 24) => (
    <g fill="#aeb3b7">
      <rect x={x} y={y} width={width} height="3" rx="1" />
      <rect x={x} y={y + 6} width={width * 0.7} height="2" rx="1" />
    </g>
  );
  const columns = layout.startsWith("columns");
  const left = ["image_left", "split_left"].includes(layout);
  const split = layout.startsWith("split_");
  return (
    <svg viewBox="0 0 96 56" width="100%" height="56" aria-hidden="true">
      {columns ? (
        <>
          {[10, 53].map((x) => (
            <g key={x}>
              {layout === "columns_title_top" && text(x, 4)}
              {image(
                x,
                layout === "columns_title_top" ? 17 : 6,
                layout === "columns_centered" ? 24 : 33,
                26,
              )}
              {text(x, 43)}
            </g>
          ))}
        </>
      ) : layout === "highlight" || layout === "background" ? (
        <>
          {image(0, 0, 96, 56)}
          <rect
            x={layout === "background" ? 10 : 24}
            y="12"
            width={layout === "background" ? 76 : 48}
            height="32"
            fill="white"
          />
          {text(31, 24, 34)}
        </>
      ) : layout === "image_above" || layout === "full_width" ? (
        <>
          {image(
            layout === "full_width" ? 0 : 10,
            0,
            layout === "full_width" ? 96 : 76,
            35,
          )}
          {text(10, 43)}
        </>
      ) : layout === "overlap" ? (
        <>
          {image(0, 0, 66, 56)}
          <rect x="38" y="12" width="58" height="34" fill="white" />
          {text(45, 25, 35)}
        </>
      ) : (
        <>
          {image(
            left ? (split ? 0 : 8) : 55,
            split ? 0 : 7,
            split ? 48 : 33,
            split ? 56 : 42,
          )}
          {text(left ? 58 : 8, 24, 28)}
        </>
      )}
    </svg>
  );
}
