// Code generated by protoc-gen-go. DO NOT EDIT.
// versions:
// 	protoc-gen-go v1.34.1
// 	protoc        v5.26.1
// source: connection_search_request.proto

package pb

import (
	protoreflect "google.golang.org/protobuf/reflect/protoreflect"
	protoimpl "google.golang.org/protobuf/runtime/protoimpl"
	durationpb "google.golang.org/protobuf/types/known/durationpb"
	timestamppb "google.golang.org/protobuf/types/known/timestamppb"
	reflect "reflect"
	sync "sync"
)

const (
	// Verify that this generated code is sufficiently up-to-date.
	_ = protoimpl.EnforceVersion(20 - protoimpl.MinVersion)
	// Verify that runtime/protoimpl is sufficiently up-to-date.
	_ = protoimpl.EnforceVersion(protoimpl.MaxVersion - 20)
)

type ConnectionsSearchRequest struct {
	state         protoimpl.MessageState
	sizeCache     protoimpl.SizeCache
	unknownFields protoimpl.UnknownFields

	Origins             []string               `protobuf:"bytes,1,rep,name=origins,proto3" json:"origins,omitempty"`
	Destinations        []string               `protobuf:"bytes,2,rep,name=destinations,proto3" json:"destinations,omitempty"`
	MinDeparture        *timestamppb.Timestamp `protobuf:"bytes,3,opt,name=min_departure,json=minDeparture,proto3" json:"min_departure,omitempty"`
	MaxDeparture        *timestamppb.Timestamp `protobuf:"bytes,4,opt,name=max_departure,json=maxDeparture,proto3" json:"max_departure,omitempty"`
	MaxFlights          uint32                 `protobuf:"varint,5,opt,name=max_flights,json=maxFlights,proto3" json:"max_flights,omitempty"`
	MinLayover          *durationpb.Duration   `protobuf:"bytes,6,opt,name=min_layover,json=minLayover,proto3" json:"min_layover,omitempty"`
	MaxLayover          *durationpb.Duration   `protobuf:"bytes,7,opt,name=max_layover,json=maxLayover,proto3" json:"max_layover,omitempty"`
	MaxDuration         *durationpb.Duration   `protobuf:"bytes,8,opt,name=max_duration,json=maxDuration,proto3" json:"max_duration,omitempty"`
	IncludeAirport      []string               `protobuf:"bytes,9,rep,name=include_airport,json=includeAirport,proto3" json:"include_airport,omitempty"`
	ExcludeAirport      []string               `protobuf:"bytes,10,rep,name=exclude_airport,json=excludeAirport,proto3" json:"exclude_airport,omitempty"`
	IncludeFlightNumber []string               `protobuf:"bytes,11,rep,name=include_flight_number,json=includeFlightNumber,proto3" json:"include_flight_number,omitempty"`
	ExcludeFlightNumber []string               `protobuf:"bytes,12,rep,name=exclude_flight_number,json=excludeFlightNumber,proto3" json:"exclude_flight_number,omitempty"`
	IncludeAircraft     []string               `protobuf:"bytes,13,rep,name=include_aircraft,json=includeAircraft,proto3" json:"include_aircraft,omitempty"`
	ExcludeAircraft     []string               `protobuf:"bytes,14,rep,name=exclude_aircraft,json=excludeAircraft,proto3" json:"exclude_aircraft,omitempty"`
}

func (x *ConnectionsSearchRequest) Reset() {
	*x = ConnectionsSearchRequest{}
	if protoimpl.UnsafeEnabled {
		mi := &file_connection_search_request_proto_msgTypes[0]
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		ms.StoreMessageInfo(mi)
	}
}

func (x *ConnectionsSearchRequest) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*ConnectionsSearchRequest) ProtoMessage() {}

func (x *ConnectionsSearchRequest) ProtoReflect() protoreflect.Message {
	mi := &file_connection_search_request_proto_msgTypes[0]
	if protoimpl.UnsafeEnabled && x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use ConnectionsSearchRequest.ProtoReflect.Descriptor instead.
func (*ConnectionsSearchRequest) Descriptor() ([]byte, []int) {
	return file_connection_search_request_proto_rawDescGZIP(), []int{0}
}

func (x *ConnectionsSearchRequest) GetOrigins() []string {
	if x != nil {
		return x.Origins
	}
	return nil
}

func (x *ConnectionsSearchRequest) GetDestinations() []string {
	if x != nil {
		return x.Destinations
	}
	return nil
}

func (x *ConnectionsSearchRequest) GetMinDeparture() *timestamppb.Timestamp {
	if x != nil {
		return x.MinDeparture
	}
	return nil
}

func (x *ConnectionsSearchRequest) GetMaxDeparture() *timestamppb.Timestamp {
	if x != nil {
		return x.MaxDeparture
	}
	return nil
}

func (x *ConnectionsSearchRequest) GetMaxFlights() uint32 {
	if x != nil {
		return x.MaxFlights
	}
	return 0
}

func (x *ConnectionsSearchRequest) GetMinLayover() *durationpb.Duration {
	if x != nil {
		return x.MinLayover
	}
	return nil
}

func (x *ConnectionsSearchRequest) GetMaxLayover() *durationpb.Duration {
	if x != nil {
		return x.MaxLayover
	}
	return nil
}

func (x *ConnectionsSearchRequest) GetMaxDuration() *durationpb.Duration {
	if x != nil {
		return x.MaxDuration
	}
	return nil
}

func (x *ConnectionsSearchRequest) GetIncludeAirport() []string {
	if x != nil {
		return x.IncludeAirport
	}
	return nil
}

func (x *ConnectionsSearchRequest) GetExcludeAirport() []string {
	if x != nil {
		return x.ExcludeAirport
	}
	return nil
}

func (x *ConnectionsSearchRequest) GetIncludeFlightNumber() []string {
	if x != nil {
		return x.IncludeFlightNumber
	}
	return nil
}

func (x *ConnectionsSearchRequest) GetExcludeFlightNumber() []string {
	if x != nil {
		return x.ExcludeFlightNumber
	}
	return nil
}

func (x *ConnectionsSearchRequest) GetIncludeAircraft() []string {
	if x != nil {
		return x.IncludeAircraft
	}
	return nil
}

func (x *ConnectionsSearchRequest) GetExcludeAircraft() []string {
	if x != nil {
		return x.ExcludeAircraft
	}
	return nil
}

var File_connection_search_request_proto protoreflect.FileDescriptor

var file_connection_search_request_proto_rawDesc = []byte{
	0x0a, 0x1f, 0x63, 0x6f, 0x6e, 0x6e, 0x65, 0x63, 0x74, 0x69, 0x6f, 0x6e, 0x5f, 0x73, 0x65, 0x61,
	0x72, 0x63, 0x68, 0x5f, 0x72, 0x65, 0x71, 0x75, 0x65, 0x73, 0x74, 0x2e, 0x70, 0x72, 0x6f, 0x74,
	0x6f, 0x12, 0x18, 0x65, 0x78, 0x70, 0x6c, 0x6f, 0x72, 0x65, 0x5f, 0x66, 0x6c, 0x69, 0x67, 0x68,
	0x74, 0x73, 0x2e, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x62, 0x75, 0x66, 0x1a, 0x1f, 0x67, 0x6f, 0x6f,
	0x67, 0x6c, 0x65, 0x2f, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x62, 0x75, 0x66, 0x2f, 0x74, 0x69, 0x6d,
	0x65, 0x73, 0x74, 0x61, 0x6d, 0x70, 0x2e, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x1a, 0x1e, 0x67, 0x6f,
	0x6f, 0x67, 0x6c, 0x65, 0x2f, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x62, 0x75, 0x66, 0x2f, 0x64, 0x75,
	0x72, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x2e, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x22, 0xc1, 0x05, 0x0a,
	0x18, 0x43, 0x6f, 0x6e, 0x6e, 0x65, 0x63, 0x74, 0x69, 0x6f, 0x6e, 0x73, 0x53, 0x65, 0x61, 0x72,
	0x63, 0x68, 0x52, 0x65, 0x71, 0x75, 0x65, 0x73, 0x74, 0x12, 0x18, 0x0a, 0x07, 0x6f, 0x72, 0x69,
	0x67, 0x69, 0x6e, 0x73, 0x18, 0x01, 0x20, 0x03, 0x28, 0x09, 0x52, 0x07, 0x6f, 0x72, 0x69, 0x67,
	0x69, 0x6e, 0x73, 0x12, 0x22, 0x0a, 0x0c, 0x64, 0x65, 0x73, 0x74, 0x69, 0x6e, 0x61, 0x74, 0x69,
	0x6f, 0x6e, 0x73, 0x18, 0x02, 0x20, 0x03, 0x28, 0x09, 0x52, 0x0c, 0x64, 0x65, 0x73, 0x74, 0x69,
	0x6e, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x73, 0x12, 0x3f, 0x0a, 0x0d, 0x6d, 0x69, 0x6e, 0x5f, 0x64,
	0x65, 0x70, 0x61, 0x72, 0x74, 0x75, 0x72, 0x65, 0x18, 0x03, 0x20, 0x01, 0x28, 0x0b, 0x32, 0x1a,
	0x2e, 0x67, 0x6f, 0x6f, 0x67, 0x6c, 0x65, 0x2e, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x62, 0x75, 0x66,
	0x2e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d, 0x70, 0x52, 0x0c, 0x6d, 0x69, 0x6e, 0x44,
	0x65, 0x70, 0x61, 0x72, 0x74, 0x75, 0x72, 0x65, 0x12, 0x3f, 0x0a, 0x0d, 0x6d, 0x61, 0x78, 0x5f,
	0x64, 0x65, 0x70, 0x61, 0x72, 0x74, 0x75, 0x72, 0x65, 0x18, 0x04, 0x20, 0x01, 0x28, 0x0b, 0x32,
	0x1a, 0x2e, 0x67, 0x6f, 0x6f, 0x67, 0x6c, 0x65, 0x2e, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x62, 0x75,
	0x66, 0x2e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d, 0x70, 0x52, 0x0c, 0x6d, 0x61, 0x78,
	0x44, 0x65, 0x70, 0x61, 0x72, 0x74, 0x75, 0x72, 0x65, 0x12, 0x1f, 0x0a, 0x0b, 0x6d, 0x61, 0x78,
	0x5f, 0x66, 0x6c, 0x69, 0x67, 0x68, 0x74, 0x73, 0x18, 0x05, 0x20, 0x01, 0x28, 0x0d, 0x52, 0x0a,
	0x6d, 0x61, 0x78, 0x46, 0x6c, 0x69, 0x67, 0x68, 0x74, 0x73, 0x12, 0x3a, 0x0a, 0x0b, 0x6d, 0x69,
	0x6e, 0x5f, 0x6c, 0x61, 0x79, 0x6f, 0x76, 0x65, 0x72, 0x18, 0x06, 0x20, 0x01, 0x28, 0x0b, 0x32,
	0x19, 0x2e, 0x67, 0x6f, 0x6f, 0x67, 0x6c, 0x65, 0x2e, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x62, 0x75,
	0x66, 0x2e, 0x44, 0x75, 0x72, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x52, 0x0a, 0x6d, 0x69, 0x6e, 0x4c,
	0x61, 0x79, 0x6f, 0x76, 0x65, 0x72, 0x12, 0x3a, 0x0a, 0x0b, 0x6d, 0x61, 0x78, 0x5f, 0x6c, 0x61,
	0x79, 0x6f, 0x76, 0x65, 0x72, 0x18, 0x07, 0x20, 0x01, 0x28, 0x0b, 0x32, 0x19, 0x2e, 0x67, 0x6f,
	0x6f, 0x67, 0x6c, 0x65, 0x2e, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x62, 0x75, 0x66, 0x2e, 0x44, 0x75,
	0x72, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x52, 0x0a, 0x6d, 0x61, 0x78, 0x4c, 0x61, 0x79, 0x6f, 0x76,
	0x65, 0x72, 0x12, 0x3c, 0x0a, 0x0c, 0x6d, 0x61, 0x78, 0x5f, 0x64, 0x75, 0x72, 0x61, 0x74, 0x69,
	0x6f, 0x6e, 0x18, 0x08, 0x20, 0x01, 0x28, 0x0b, 0x32, 0x19, 0x2e, 0x67, 0x6f, 0x6f, 0x67, 0x6c,
	0x65, 0x2e, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x62, 0x75, 0x66, 0x2e, 0x44, 0x75, 0x72, 0x61, 0x74,
	0x69, 0x6f, 0x6e, 0x52, 0x0b, 0x6d, 0x61, 0x78, 0x44, 0x75, 0x72, 0x61, 0x74, 0x69, 0x6f, 0x6e,
	0x12, 0x27, 0x0a, 0x0f, 0x69, 0x6e, 0x63, 0x6c, 0x75, 0x64, 0x65, 0x5f, 0x61, 0x69, 0x72, 0x70,
	0x6f, 0x72, 0x74, 0x18, 0x09, 0x20, 0x03, 0x28, 0x09, 0x52, 0x0e, 0x69, 0x6e, 0x63, 0x6c, 0x75,
	0x64, 0x65, 0x41, 0x69, 0x72, 0x70, 0x6f, 0x72, 0x74, 0x12, 0x27, 0x0a, 0x0f, 0x65, 0x78, 0x63,
	0x6c, 0x75, 0x64, 0x65, 0x5f, 0x61, 0x69, 0x72, 0x70, 0x6f, 0x72, 0x74, 0x18, 0x0a, 0x20, 0x03,
	0x28, 0x09, 0x52, 0x0e, 0x65, 0x78, 0x63, 0x6c, 0x75, 0x64, 0x65, 0x41, 0x69, 0x72, 0x70, 0x6f,
	0x72, 0x74, 0x12, 0x32, 0x0a, 0x15, 0x69, 0x6e, 0x63, 0x6c, 0x75, 0x64, 0x65, 0x5f, 0x66, 0x6c,
	0x69, 0x67, 0x68, 0x74, 0x5f, 0x6e, 0x75, 0x6d, 0x62, 0x65, 0x72, 0x18, 0x0b, 0x20, 0x03, 0x28,
	0x09, 0x52, 0x13, 0x69, 0x6e, 0x63, 0x6c, 0x75, 0x64, 0x65, 0x46, 0x6c, 0x69, 0x67, 0x68, 0x74,
	0x4e, 0x75, 0x6d, 0x62, 0x65, 0x72, 0x12, 0x32, 0x0a, 0x15, 0x65, 0x78, 0x63, 0x6c, 0x75, 0x64,
	0x65, 0x5f, 0x66, 0x6c, 0x69, 0x67, 0x68, 0x74, 0x5f, 0x6e, 0x75, 0x6d, 0x62, 0x65, 0x72, 0x18,
	0x0c, 0x20, 0x03, 0x28, 0x09, 0x52, 0x13, 0x65, 0x78, 0x63, 0x6c, 0x75, 0x64, 0x65, 0x46, 0x6c,
	0x69, 0x67, 0x68, 0x74, 0x4e, 0x75, 0x6d, 0x62, 0x65, 0x72, 0x12, 0x29, 0x0a, 0x10, 0x69, 0x6e,
	0x63, 0x6c, 0x75, 0x64, 0x65, 0x5f, 0x61, 0x69, 0x72, 0x63, 0x72, 0x61, 0x66, 0x74, 0x18, 0x0d,
	0x20, 0x03, 0x28, 0x09, 0x52, 0x0f, 0x69, 0x6e, 0x63, 0x6c, 0x75, 0x64, 0x65, 0x41, 0x69, 0x72,
	0x63, 0x72, 0x61, 0x66, 0x74, 0x12, 0x29, 0x0a, 0x10, 0x65, 0x78, 0x63, 0x6c, 0x75, 0x64, 0x65,
	0x5f, 0x61, 0x69, 0x72, 0x63, 0x72, 0x61, 0x66, 0x74, 0x18, 0x0e, 0x20, 0x03, 0x28, 0x09, 0x52,
	0x0f, 0x65, 0x78, 0x63, 0x6c, 0x75, 0x64, 0x65, 0x41, 0x69, 0x72, 0x63, 0x72, 0x61, 0x66, 0x74,
	0x42, 0x0b, 0x5a, 0x09, 0x67, 0x6f, 0x2f, 0x61, 0x70, 0x69, 0x2f, 0x70, 0x62, 0x62, 0x06, 0x70,
	0x72, 0x6f, 0x74, 0x6f, 0x33,
}

var (
	file_connection_search_request_proto_rawDescOnce sync.Once
	file_connection_search_request_proto_rawDescData = file_connection_search_request_proto_rawDesc
)

func file_connection_search_request_proto_rawDescGZIP() []byte {
	file_connection_search_request_proto_rawDescOnce.Do(func() {
		file_connection_search_request_proto_rawDescData = protoimpl.X.CompressGZIP(file_connection_search_request_proto_rawDescData)
	})
	return file_connection_search_request_proto_rawDescData
}

var file_connection_search_request_proto_msgTypes = make([]protoimpl.MessageInfo, 1)
var file_connection_search_request_proto_goTypes = []interface{}{
	(*ConnectionsSearchRequest)(nil), // 0: explore_flights.protobuf.ConnectionsSearchRequest
	(*timestamppb.Timestamp)(nil),    // 1: google.protobuf.Timestamp
	(*durationpb.Duration)(nil),      // 2: google.protobuf.Duration
}
var file_connection_search_request_proto_depIdxs = []int32{
	1, // 0: explore_flights.protobuf.ConnectionsSearchRequest.min_departure:type_name -> google.protobuf.Timestamp
	1, // 1: explore_flights.protobuf.ConnectionsSearchRequest.max_departure:type_name -> google.protobuf.Timestamp
	2, // 2: explore_flights.protobuf.ConnectionsSearchRequest.min_layover:type_name -> google.protobuf.Duration
	2, // 3: explore_flights.protobuf.ConnectionsSearchRequest.max_layover:type_name -> google.protobuf.Duration
	2, // 4: explore_flights.protobuf.ConnectionsSearchRequest.max_duration:type_name -> google.protobuf.Duration
	5, // [5:5] is the sub-list for method output_type
	5, // [5:5] is the sub-list for method input_type
	5, // [5:5] is the sub-list for extension type_name
	5, // [5:5] is the sub-list for extension extendee
	0, // [0:5] is the sub-list for field type_name
}

func init() { file_connection_search_request_proto_init() }
func file_connection_search_request_proto_init() {
	if File_connection_search_request_proto != nil {
		return
	}
	if !protoimpl.UnsafeEnabled {
		file_connection_search_request_proto_msgTypes[0].Exporter = func(v interface{}, i int) interface{} {
			switch v := v.(*ConnectionsSearchRequest); i {
			case 0:
				return &v.state
			case 1:
				return &v.sizeCache
			case 2:
				return &v.unknownFields
			default:
				return nil
			}
		}
	}
	type x struct{}
	out := protoimpl.TypeBuilder{
		File: protoimpl.DescBuilder{
			GoPackagePath: reflect.TypeOf(x{}).PkgPath(),
			RawDescriptor: file_connection_search_request_proto_rawDesc,
			NumEnums:      0,
			NumMessages:   1,
			NumExtensions: 0,
			NumServices:   0,
		},
		GoTypes:           file_connection_search_request_proto_goTypes,
		DependencyIndexes: file_connection_search_request_proto_depIdxs,
		MessageInfos:      file_connection_search_request_proto_msgTypes,
	}.Build()
	File_connection_search_request_proto = out.File
	file_connection_search_request_proto_rawDesc = nil
	file_connection_search_request_proto_goTypes = nil
	file_connection_search_request_proto_depIdxs = nil
}
