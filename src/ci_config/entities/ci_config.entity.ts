
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
@Entity('tbl_Settings')
export class CiConfig {
@PrimaryGeneratedColumn()
  id: number;

  @Column() 
  clientId: string;

  @Column()
  itemName: string;

  @Column()
  itemValue: string;
}
