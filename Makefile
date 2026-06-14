

.PHONY: heart-list

heart-list:
	echo "select * from public.videos where userpic = 'Heart'" | PGPASSWORD="password" psql -U user -h localhost -d video_db -p 5432


skip-list:
	echo "select * from public.videos where userpic = 'Heart-'" | PGPASSWORD="password" psql -U user -h localhost -d video_db -p 5432

todo-list:
	echo "select * from public.videos where userpic NOT LIKE 'Heart%'" | PGPASSWORD="password" psql -U user -h localhost -d video_db -p 5432
