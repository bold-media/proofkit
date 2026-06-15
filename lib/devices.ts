// Device buckets a comment can belong to (which preview width it was placed in).
// Dependency-free so client components can import it without pulling lib/data.
export const DEVICE_SIZES = ['desktop', 'tablet', 'mobile'] as const
export type DeviceSize = (typeof DEVICE_SIZES)[number]
export const DEVICE_LABEL: Record<string, string> = {
  desktop: 'Desktop',
  tablet: 'Tablet',
  mobile: 'Mobile',
}
