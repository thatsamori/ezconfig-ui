import { acceptedCurvePoints, STOCK_CURVE_POINTS } from '@/lib/config/releaseCurve';

/** Corners stay inside the picture, where half a line's width would be cut off. */
const VIEW_BOX = '-4 -4 108 108';

/**
 * A release curve as a picture, wherever it stands in for the value: an override
 * in its own line, no override (undefined or null) as the stock shape, dimmed. A
 * value the shape rules refuse has no picture to give, so it says so.
 */
export function ReleaseCurveThumbnail({ value }: { value: unknown }) {
  const stock = value === undefined || value === null;
  const points = stock ? STOCK_CURVE_POINTS : acceptedCurvePoints(value);
  if (!points) {
    const text = `Refused release curve: ${JSON.stringify(value)}`;
    return <span className="curve-thumbnail curve-refused" title={text}>Refused</span>;
  }
  const text = stock ? 'Stock release curve' : `Release curve: ${points.map(({ time, progress }) => `(${time},${progress})`).join(' ')}`;
  return <svg className={`curve-thumbnail${stock ? ' curve-stock' : ''}`} viewBox={VIEW_BOX} preserveAspectRatio="none" role="img" aria-label={text}>
    <title>{text}</title>
    <polyline points={points.map(({ time, progress }) => `${Math.round(time * 100)},${Math.round((1 - progress) * 100)}`).join(' ')} vectorEffect="non-scaling-stroke" />
  </svg>;
}
