import {
  AttributeValue,
  DynamoDBClient,
  ScanCommandInput,
  ScanCommandOutput,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  S3Client,
  PutObjectCommand,
  PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import * as csv from 'csv/sync';

export const ddbClient = new DynamoDBClient({ region: 'ap-northeast-1' });
const s3 = new S3Client({ region: 'ap-northeast-1' });

const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

const ddbParams: ScanCommandInput = {
  TableName: process.env.DDB_TABLE_NAME,
};
const Bucket = process.env.BUCKET_NAME;

const scanTable = async ({
  ddbParams,
}: {
  ddbParams: ScanCommandInput;
}): Promise<ScanCommandOutput> => {
  const data = await ddbDocClient.send(new ScanCommand(ddbParams));
  console.log('success', data);
  return data;
};

const uploadToS3 = async (putParams: PutObjectCommandInput) => {
  try {
    const data = await s3.send(new PutObjectCommand(putParams));
    console.log(`File uploaded successfully. ${data}`);
  } catch (err) {
    console.log('Error', err);
  }
};

interface EventParams {
  limit: number;
  LastEvaluatedKey?: Record<string, AttributeValue>;
}

// TODO:dayjsを使って日付と時刻分秒でファイル名を分割する
export const handler = async (event: EventParams): Promise<any> => {
  console.log(event);
  const limit = event.limit;
  /**
   * インプットは LastEvaluatedKey, limit
   * LastEvaluatedKeyが存在したら続きから実行
   */
  if (event.LastEvaluatedKey != null) {
    ddbParams.ExclusiveStartKey = event.LastEvaluatedKey;
    ddbParams.Limit = limit;
    try {
      const response = await scanTable({
        ddbParams,
      });
      if (response.LastEvaluatedKey != null) {
        console.log(response.Count);
        console.log({ message: '続行', response });
        return {
          LastEvaluatedKey: response.LastEvaluatedKey,
          limit,
        };
      } else {
        // 最終実行分を返す
        console.log(response.Count);
        console.log({ message: 'csvを作成します' });
        const csvExportData = csv.stringify(response.Items!, { header: true });

        console.log({ message: 's3にアップロードします' });

        await uploadToS3({
          Bucket,
          Key: `sample-line-members.csv`,
          Body: csvExportData,
        });

        console.log({ message: 'アップロード完了しました' });
        return { LastEvaluatedKey: null };
      }
    } catch (dbError) {
      return { statusCode: 500, body: JSON.stringify(dbError) };
    }
  }
  try {
    ddbParams.Limit = limit;
    const response = await scanTable({
      ddbParams,
    });
    if (response.LastEvaluatedKey != null) {
      console.log(response.Count);

      console.log({ message: 'csvを作成します' });
      const csvExportData = csv.stringify(response.Items!, { header: true });

      console.log({ message: 's3にアップロードします' });

      await uploadToS3({
        Bucket,
        Key: `sample-line-members.csv`,
        Body: csvExportData,
      });

      console.log({ message: 'アップロード完了しました' });

      console.log({ message: '続行', response });
      return {
        LastEvaluatedKey: response.LastEvaluatedKey,
        limit,
      };
    } else {
      console.log(response.Count);

      console.log({ message: 'csvを作成します' });
      const csvExportData = csv.stringify(response.Items!, { header: true });

      console.log({ message: 's3にアップロードします' });

      await uploadToS3({
        Bucket,
        Key: `sample-line-members.csv`,
        Body: csvExportData,
      });

      console.log({ message: 'アップロード完了しました' });

      console.log({ message: '完了', response });
      // 1発で完了
      return { LastEvaluatedKey: null };
    }
  } catch (dbError) {
    return { statusCode: 500, body: JSON.stringify(dbError) };
  }
};
