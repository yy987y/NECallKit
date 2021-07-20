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
