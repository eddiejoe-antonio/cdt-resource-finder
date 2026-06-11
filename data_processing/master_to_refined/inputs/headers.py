import pandas as pd
new = pd.read_csv('newtemplate_master_061124.csv', nrows=0)
old = pd.read_csv('oldtemplate_master_041426.csv', nrows=0)
print(list(new.columns))
print(list(old.columns))