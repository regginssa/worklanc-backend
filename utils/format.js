const toTitleCase = (str) => {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const toCamelCase = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(toCamelCase);
  }

  if (obj !== null && obj.constructor === Object) {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, char) =>
        char.toUpperCase(),
      );

      result[camelKey] = toCamelCase(obj[key]);

      return result;
    }, {});
  }

  return obj;
};

module.exports = { toTitleCase, toCamelCase };
