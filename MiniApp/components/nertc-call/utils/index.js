export const uuid = () => Math.ceil(Math.random() * 1e5) + '';
export const requestId = () => `${+new Date() + uuid()}_id`;

export const toast = (title, icon = 'none', duration, options) => {
    wx.showToast({
        title: title || '',
        icon: icon,
        image: (options && options.image) || '',
        duration: duration || 2000,
        mask: false,
    });
}

export const compareVersion = (curVersion = '', target = '') => {
  const cur = curVersion.split('.');
  const targets = target.split('.');

  if (cur.length !== 3 || targets.length !== 3) {
    return false
  }

  return cur.reduce((p, c, index) => {
    const _c = Number(c);
    const _t = Number(targets[index]);

    if (_c < _t) {
      return p && false
    }

    if (_c >= _t) {
      return p && true
    }
  }, true)
}

export const parseAttachExt = (attachExt) => {
  try {
    attachExt = JSON.parse(attachExt)
    const { version, channelName } = attachExt
    if (version && channelName && compareVersion(version, '1.1.0')) {
      return attachExt
    }
    return false
  } catch (error) {
    return false
  }
}

export const prevent = (fn, delay) => {
  let last = 0
  return function(...args) {
    const cur = Date.now()
    if (cur - last > delay) {
      fn.apply(this, args);
      last = cur;
    }
  }
}
