import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {Attribute, AttributeType, Table, ProjectionType } from 'aws-cdk-lib/aws-dynamodb';

export class TableStack extends Stack {

  public readonly feedbackTable : Table;
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Define the second table (UserFeedbackTable)
    const userFeedbackTable = new Table(scope, 'UserFeedbackTableEEA', {
      partitionKey: { name: 'type', type: AttributeType.STRING },
      sortKey: { name: 'topic', type: AttributeType.STRING },
    });

    // Add a global secondary index to UserFeedbackTable with partition key CreatedAt
    userFeedbackTable.addGlobalSecondaryIndex({
      indexName: 'CreatedAtIndex',
      partitionKey: { name: 'CreatedAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    
    userFeedbackTable.addGlobalSecondaryIndex({
      indexName: 'AnyIndex',
      partitionKey: { name: 'Any', type: AttributeType.STRING },
      sortKey: { name: 'CreatedAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.feedbackTable = userFeedbackTable;    
  }
}