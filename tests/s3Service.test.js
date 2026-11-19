const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const s3Service = require('../src/services/s3Service');

describe('S3 Service Tests', () => {
  const sampleUrl = 'https://buyer-selection-images-prod.s3.us-east-1.amazonaws.com/buyerapp-image/Summer2026/Dress1/test_img.jpg';
  const sampleKey = 'buyerapp-image/Summer2026/Dress1/test_img.jpg';

  test('extractKeyFromUrl extracts S3 key from full HTTPS URL', () => {
    const key = s3Service.extractKeyFromUrl(sampleUrl);
    assert.equal(key, sampleKey);
  });

  test('extractKeyFromUrl preserves raw key if already a key', () => {
    const key = s3Service.extractKeyFromUrl(sampleKey);
    assert.equal(key, sampleKey);
  });

  test('extractKeyFromUrl returns null for null/empty input', () => {
    assert.equal(s3Service.extractKeyFromUrl(null), null);
    assert.equal(s3Service.extractKeyFromUrl(''), null);
  });

  test('extractS3Urls parses S3 URLs from JSON array string', () => {
    const jsonStr = JSON.stringify([sampleUrl, 'data:image/jpeg;base64,xxxx']);
    const urls = s3Service.extractS3Urls(jsonStr);
    assert.equal(urls.length, 1);
    assert.equal(urls[0], sampleUrl);
  });

  test('extractS3Urls parses S3 URLs from single string', () => {
    const urls = s3Service.extractS3Urls(sampleUrl);
    assert.equal(urls.length, 1);
    assert.equal(urls[0], sampleUrl);
  });

  test('extractS3Urls ignores non-S3 URLs or data URIs', () => {
    const urls = s3Service.extractS3Urls('["data:image/png;base64,abc", "https://other-site.com/img.jpg"]');
    assert.equal(urls.length, 0);
  });

  test('extractS3Urls returns empty array for null/empty', () => {
    assert.deepEqual(s3Service.extractS3Urls(null), []);
    assert.deepEqual(s3Service.extractS3Urls(''), []);
    assert.deepEqual(s3Service.extractS3Urls('[]'), []);
  });

  test('isPlmDefaultImage correctly identifies PLM default images', () => {
    assert.equal(s3Service.isPlmDefaultImage('https://buyer-selection-images-prod.s3.us-east-1.amazonaws.com/buyerapp-image/Project1/StyleA/StyleA_default_1700000000.jpg'), true);
    assert.equal(s3Service.isPlmDefaultImage('buyerapp-image/Project1/StyleA/StyleA_default_1700000000.jpg'), true);
    assert.equal(s3Service.isPlmDefaultImage('https://buyer-selection-images-prod.s3.us-east-1.amazonaws.com/buyerapp-image/Project1/StyleA/annotation_1.jpg'), false);
    assert.equal(s3Service.isPlmDefaultImage(null), false);
  });

  test('deleteImageFromS3 blocks deletion of PLM default image and returns false without deleting', async () => {
    const plmUrl = 'https://buyer-selection-images-prod.s3.us-east-1.amazonaws.com/buyerapp-image/Project1/StyleA/StyleA_default_1700000000.jpg';
    const result = await s3Service.deleteImageFromS3(plmUrl);
    assert.equal(result, false);
  });

  test('deleteProjectFolderFromS3 returns false for null/empty project', async () => {
    assert.equal(await s3Service.deleteProjectFolderFromS3(null), false);
    assert.equal(await s3Service.deleteProjectFolderFromS3(''), false);
  });

  test('deleteStyleFolderFromS3 returns false for null/empty inputs', async () => {
    assert.equal(await s3Service.deleteStyleFolderFromS3(null, 'StyleA'), false);
    assert.equal(await s3Service.deleteStyleFolderFromS3('Project1', null), false);
  });
});
