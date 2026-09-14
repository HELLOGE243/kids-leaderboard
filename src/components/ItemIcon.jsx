function ItemIcon({ icon, size = 32 }) {
  if (icon && icon.startsWith('data:')) {
    return <img src={icon} alt="" style={{ width: size, height: size, objectFit: 'contain', imageRendering: 'pixelated' }} />
  }
  return <span style={{ fontSize: size * 0.7, lineHeight: 1 }}>{icon || '📦'}</span>
}

export default ItemIcon
